<?php

namespace AsyncTasks\Workers;

use Database;
use Engine;
use Stomp;
use TaskRunner\Commons\AbstractElement;
use TaskRunner\Commons\AbstractWorker;
use TmKeyManagement_Filter;
use TmKeyManagement_MemoryKeyDao;
use TmKeyManagement_MemoryKeyStruct;
use TmKeyManagement_TmKeyManagement;
use TmKeyManagement_TmKeyStruct;
use TMSService;
use Utils;

class GlossaryWorker extends AbstractWorker {

    const DELETE_ACTION = 'delete';
    const GET_ACTION    = 'get';
    const SET_ACTION    = 'set';
    const UPDATE_ACTION = 'update';

    /**
     * @param AbstractElement $queueElement
     *
     * @return mixed|void
     * @throws \Exception
     */
    public function process( AbstractElement $queueElement ) {

        $params  = $queueElement->params->toArray();
        $action  = $params[ 'action' ];
        $payload = $params[ 'payload' ];

        if ( false === in_array( $action, [ self::DELETE_ACTION, self::GET_ACTION, self::SET_ACTION, self::UPDATE_ACTION ] ) ) {
            throw new \InvalidArgumentException( $action . ' is not an allowed action. ' );
        }

        $this->_doLog( 'GLOSSARY: ' . $action . ' action was executed with payload ' . json_encode( $payload ) );

        $this->{$action}( $payload );
    }

    /**
     * Delete a key from MyMemory
     *
     * @param $payload
     *
     * @throws \Exception
     */
    private function delete( $payload ) {

        $message = [];

        $tm_keys    = $payload[ 'tm_keys' ];
        $user       = $this->getUser( $payload[ 'user' ] );
        $featureSet = $this->getFeatureSetFromString( $payload[ 'featuresString' ] );
        $_TMS       = $this->getEngine( $featureSet );
        $userRole   = $payload[ 'userRole' ];
        $id_match   = $payload[ 'id_match' ];
        $config     = $payload[ 'config' ];

        //get TM keys with read grants
        $tm_keys = TmKeyManagement_TmKeyManagement::getJobTmKeys( $tm_keys, 'w', 'glos', $user->uid, $userRole );

        $Filter                  = \SubFiltering\Filter::getInstance( $featureSet );
        $config[ 'segment' ]     = $Filter->fromLayer2ToLayer0( $config[ 'segment' ] );
        $config[ 'translation' ] = $Filter->fromLayer2ToLayer0( $config[ 'translation' ] );

        //prepare the error report
        $set_code = [];
        //set the glossary entry for each key with write grants
        if ( count( $tm_keys ) ) {

            /**
             * @var $tm_key TmKeyManagement_TmKeyStruct
             */
            foreach ( $tm_keys as $tm_key ) {
                $config[ 'id_user' ]  = $tm_key->key;
                $config[ 'id_match' ] = $id_match;
                $TMS_RESULT           = $_TMS->delete( $config );
                $set_code[]           = $TMS_RESULT;
            }
        }

        $set_successful = true;
        if ( array_search( false, $set_code, true ) ) {
            $set_successful = false;
        }

        $message[ 'code' ] = $set_successful;
        $message[ 'data' ] = ( $set_successful ? 'OK' : null );

        $this->publishMessage( 'glossary_delete', $message );
    }

    /**
     * Get a key from MyMemory
     *
     * @param $payload
     *
     * @throws \Exception
     */
    private function get( $payload ) {

        $message = [];

        $user         = $this->getUser( $payload[ 'user' ] );
        $featureSet   = $this->getFeatureSetFromString( $payload[ 'featuresString' ] );
        $_TMS         = $this->getEngine( $featureSet );
        $tm_keys      = $payload[ 'tm_keys' ];
        $userRole     = $payload[ 'userRole' ];
        $jobData      = $payload[ 'jobData' ];
        $config       = $payload[ 'config' ];
        $automatic    = $payload[ 'automatic' ];
        $segment      = $payload[ 'segment' ];
        $userIsLogged = $payload[ 'userIsLogged' ];
        $fromtarget   = $payload[ 'fromtarget' ];

        //get TM keys with read grants
        $tm_keys = TmKeyManagement_TmKeyManagement::getJobTmKeys( $tm_keys, 'r', 'glos', $user->uid, $userRole );

        if ( count( $tm_keys ) ) {
            $config[ 'id_user' ] = [];
            /**
             * @var $tm_key TmKeyManagement_TmKeyStruct
             */
            foreach ( $tm_keys as $tm_key ) {
                $config[ 'id_user' ][] = $tm_key->key;
            }
        }

        $TMS_RESULT = $_TMS->get( $config )->get_glossary_matches_as_array();

        /**
         * Return only exact matches in glossary when a search is executed over the entire segment
         * Reordered by positional status of matches in source
         *
         * Example:
         * Segment: On average, Members of the House of Commons have 4,2 support staff.
         *
         * Glossary terms found: House of Commons, House of Lords
         *
         * Return: House of Commons
         *
         */
        if ( $automatic ) {
            $tmp_result = [];
            foreach ( $TMS_RESULT as $k => $val ) {
                // cleaning 'ZERO WIDTH SPACE' unicode char \xE2\x80\x8B
                if ( ( $res = mb_stripos( $segment, preg_replace( '/([ \t\n\r\0\x0A\xA0]|\xE2\x80\x8B)+$/', '', $k ) ) ) === false ) {
                    unset( $TMS_RESULT[ $k ] );
                } else {
                    $tmp_result[ $k ] = $res;
                }
            }
            asort( $tmp_result );
            $tmp_result = array_keys( $tmp_result );

            $ordered_Result = [];
            foreach ( $tmp_result as $glossary_matches ) {
                $_k                    = preg_replace( '/\xE2\x80\x8B$/', '', $glossary_matches ); // cleaning 'ZERO WIDTH SPACE' unicode char \xE2\x80\x8B
                $ordered_Result[ $_k ] = $TMS_RESULT[ $glossary_matches ];
            }
            $TMS_RESULT = $ordered_Result;
        }

        //check if user is logged. If so, get the uid.
        $uid = null;
        if ( $userIsLogged ) {
            $uid = $user->uid;
        }

        foreach ( $TMS_RESULT as $k => $glossaryMatch ) {
            $TMS_RESULT[ $k ][ 0 ][ 'last_updated_by' ] = Utils::changeMemorySuggestionSource(
                    $glossaryMatch[ 0 ],
                    $jobData[ 'tm_keys' ],
                    $jobData[ 'owner' ],
                    $uid );

            $TMS_RESULT[ $k ][ 0 ][ 'created_by' ] = $TMS_RESULT[ $k ][ 0 ][ 'last_updated_by' ];
            if ( $fromtarget ) { //Search by target
                $source                                     = $TMS_RESULT[ $k ][ 0 ][ 'segment' ];
                $rawsource                                  = $TMS_RESULT[ $k ][ 0 ][ 'raw_segment' ];
                $TMS_RESULT[ $k ][ 0 ][ 'segment' ]         = $TMS_RESULT[ $k ][ 0 ][ 'translation' ];
                $TMS_RESULT[ $k ][ 0 ][ 'translation' ]     = $source;
                $TMS_RESULT[ $k ][ 0 ][ 'raw_segment' ]     = $TMS_RESULT[ $k ][ 0 ][ 'raw_translation' ];
                $TMS_RESULT[ $k ][ 0 ][ 'raw_translation' ] = $rawsource;
            }
        }

        $message[ 'data' ][ 'matches' ] = $TMS_RESULT;

        $this->publishMessage( 'glossary_get', $message );
    }

    /**
     * Set a key in MyMemory
     *
     * @param $payload
     *
     * @throws \Exception
     */
    private function set( $payload ) {

        $message             = [];
        $message[ 'errors' ] = [];

        $user         = $this->getUser( $payload[ 'user' ] );
        $featureSet   = $this->getFeatureSetFromString( $payload[ 'featuresString' ] );
        $_TMS         = $this->getEngine( $featureSet );
        $tm_keys      = $payload[ 'tm_keys' ];
        $userRole     = $payload[ 'userRole' ];
        $jobData      = $payload[ 'jobData' ];
        $tmProps      = $payload[ 'tmProps' ];
        $config       = $payload[ 'config' ];
        $id_job       = $payload[ 'id_job' ];
        $password     = $payload[ 'password' ];
        $userIsLogged = $payload[ 'userIsLogged' ];

        //get TM keys with read grants
        $tm_keys = TmKeyManagement_TmKeyManagement::getJobTmKeys( $tm_keys, 'w', 'glos', $user->uid, $userRole );

        if ( empty( $tm_keys ) ) {

            $APIKeySrv = new TMSService();
            $newUser   = (object)$APIKeySrv->createMyMemoryKey(); //throws exception

            //fallback
            $config[ 'id_user' ] = $newUser->id;

            $new_key        = TmKeyManagement_TmKeyManagement::getTmKeyStructure();
            $new_key->tm    = 1;
            $new_key->glos  = 1;
            $new_key->key   = $newUser->key;
            $new_key->owner = ( $user->email == $jobData[ 'owner' ] );

            if ( !$new_key->owner ) {
                $new_key->{TmKeyManagement_Filter::$GRANTS_MAP[ $userRole ][ 'r' ]} = 1;
                $new_key->{TmKeyManagement_Filter::$GRANTS_MAP[ $userRole ][ 'w' ]} = 1;
            } else {
                $new_key->r = 1;
                $new_key->w = 1;
            }

            if ( $new_key->owner ) {
                //do nothing, this is a greedy if
            } elseif ( $userRole == TmKeyManagement_Filter::ROLE_TRANSLATOR ) {
                $new_key->uid_transl = $user->uid;
            } elseif ( $userRole == TmKeyManagement_Filter::ROLE_REVISOR ) {
                $new_key->uid_rev = $user->uid;
            }

            //create an empty array
            $tm_keys = [];
            //append new key
            $tm_keys[] = $new_key;

            //put the key in the job
            TmKeyManagement_TmKeyManagement::setJobTmKeys( $id_job, $password, $tm_keys );

            //put the key in the user keiring
            if ( $userIsLogged ) {
                $newMemoryKey         = new TmKeyManagement_MemoryKeyStruct();
                $newMemoryKey->tm_key = $new_key;
                $newMemoryKey->uid    = $user->uid;

                $mkDao = new TmKeyManagement_MemoryKeyDao( Database::obtain() );

                $mkDao->create( $newMemoryKey );
            }
        }

        $config[ 'segment' ]     = htmlspecialchars( $config[ 'segment' ], ENT_XML1 | ENT_QUOTES, 'UTF-8', false ); //no XML sanitization is needed because those requests are plain text from UI
        $config[ 'translation' ] = htmlspecialchars( $config[ 'translation' ], ENT_XML1 | ENT_QUOTES, 'UTF-8', false ); //no XML sanitization is needed because those requests are plain text from UI

        $config[ 'prop' ] = $tmProps;
        $featureSet->filter( 'filterGlossaryOnSetTranslation', $config[ 'prop' ], $user );
        $config[ 'prop' ] = json_encode( $config[ 'prop' ] );

        //prepare the error report
        $set_code = [];
        //set the glossary entry for each key with write grants
        if ( count( $tm_keys ) ) {
            /**
             * @var $tm_keys TmKeyManagement_TmKeyStruct[]
             */
            foreach ( $tm_keys as $tm_key ) {
                $config[ 'id_user' ] = $tm_key->key;
                $TMS_RESULT          = $_TMS->set( $config );
                $set_code[]          = $TMS_RESULT;
            }
        }

        $set_successful = true;
        if ( array_search( false, $set_code, true ) ) {
            //There's an error, for now skip, let's assume that are not errors
            $set_successful = false;
        }

        if ( $set_successful ) {
//          Often the get method after a set is not in real time, so return the same values ( FAKE )
//          $TMS_GET_RESULT = $this->_TMS->get($config)->get_glossary_matches_as_array();
//          $this->result['data']['matches'] = $TMS_GET_RESULT;
            $message[ 'data' ][ 'matches' ] = [
                    $config[ 'segment' ] => [
                            [
                                    'segment'          => $config[ 'segment' ],
                                    'translation'      => $config[ 'translation' ],
                                    'last_update_date' => date_create()->format( 'Y-m-d H:i:m' ),
                                    'last_updated_by'  => "Matecat user",
                                    'created_by'       => "Matecat user",
                                    'target_note'      => $config[ 'tnote' ],
                            ]
                    ]
            ];

            if ( isset( $new_key ) ) {
                $message[ 'data' ][ 'created_tm_key' ] = true;
            }

        } else {
            $message[ 'errors' ][] = [ "code" => -1, "message" => "We got an error, please try again." ];
        }

        $this->publishMessage( 'glossary_set', $message );
    }

    /**
     * Update a key from MyMemory
     *
     * @param $payload
     *
     * @throws \Exception
     */
    private function update( $payload ) {

        $message = [];

        $user       = $this->getUser( $payload[ 'user' ] );
        $featureSet = $this->getFeatureSetFromString( $payload[ 'featuresString' ] );
        $_TMS       = $this->getEngine( $featureSet );
        $tm_keys    = $payload[ 'tm_keys' ];
        $userRole   = $payload[ 'userRole' ];
        $tmProps    = $payload[ 'tmProps' ];
        $config     = $payload[ 'config' ];

        //get TM keys with read grants
        $tm_keys = TmKeyManagement_TmKeyManagement::getJobTmKeys( $tm_keys, 'w', 'glos', $user->uid, $userRole );

        $config[ 'segment' ]     = htmlspecialchars( $config[ 'segment' ], ENT_XML1 | ENT_QUOTES, 'UTF-8', false ); //no XML sanitization is needed because those requests are plain text from UI
        $config[ 'translation' ] = htmlspecialchars( $config[ 'translation' ], ENT_XML1 | ENT_QUOTES, 'UTF-8', false ); //no XML sanitization is needed because those requests are plain text from UI

        $config[ 'prop' ] = $tmProps;
        $featureSet->filter( 'filterGlossaryOnSetTranslation', $config[ 'prop' ], $user );
        $config[ 'prop' ] = json_encode( $config[ 'prop' ] );

        if ( $config[ 'newsegment' ] && $config[ 'newtranslation' ] ) {
            $config[ 'newsegment' ]     = htmlspecialchars( $config[ 'newsegment' ], ENT_XML1 | ENT_QUOTES, 'UTF-8', false ); //no XML sanitization is needed because those requests are plain text from UI
            $config[ 'newtranslation' ] = htmlspecialchars( $config[ 'newtranslation' ], ENT_XML1 | ENT_QUOTES, 'UTF-8', false ); //no XML sanitization is needed because those requests are plain text from UI
        }

        //prepare the error report
        $set_code = [];
        //set the glossary entry for each key with write grants
        if ( count( $tm_keys ) ) {
            /**
             * @var $tm_key TmKeyManagement_TmKeyStruct
             */
            foreach ( $tm_keys as $tm_key ) {
                $config[ 'id_user' ] = $tm_key->key;
                $TMS_RESULT          = $_TMS->updateGlossary( $config );
                $set_code[]          = $TMS_RESULT;
            }
        }

        $set_successful = true;
        if ( array_search( false, $set_code, true ) ) {
            $set_successful = false;
        }

        //reset key list
        $config[ 'id_user' ] = [];
        foreach ( $tm_keys as $tm_key ) {
            $config[ 'id_user' ][] = $tm_key->key;
        }

        if ( $set_successful ) {
            $TMS_GET_RESULT                 = $_TMS->get( $config )->get_glossary_matches_as_array();
            $message[ 'data' ][ 'matches' ] = $TMS_GET_RESULT;
        }

        $this->publishMessage( 'glossary_update', $message );
    }

    /**
     * @param string $type
     * @param array  $message
     *
     * @throws \StompException
     */
    private function publishMessage( $type, array $message ) {

        $_object = [
                '_type' => $type,
                'data'  => [
                    'payload' => $message,
                ]
        ];

        $message = json_encode( $_object );

        $stomp = new Stomp( \INIT::$QUEUE_BROKER_ADDRESS );
        $stomp->connect();
        $stomp->send( \INIT::$SSE_NOTIFICATIONS_QUEUE_NAME,
                $message,
                [ 'persistent' => 'false' ]
        );

        $this->_doLog( $message );
    }

    /**
     * @param $featuresString
     *
     * @return \FeatureSet
     * @throws \Exception
     */
    private function getFeatureSetFromString( $featuresString ) {
        $featureSet = new \FeatureSet();
        $featureSet->loadFromString( $featuresString );

        return $featureSet;
    }

    /**
     * @param \FeatureSet $featureSet
     *
     * @return \Engines_AbstractEngine
     * @throws \Exception
     */
    private function getEngine( \FeatureSet $featureSet ) {
        $_TMS = Engine::getInstance( 1 );
        $_TMS->setFeatureSet( $featureSet );

        return $_TMS;
    }

    /**
     * @param $array
     *
     * @return \Users_UserStruct
     */
    private function getUser( $array ) {
        return new \Users_UserStruct( [
                'uid'         => $array[ 'uid' ],
                'email'       => $array[ 'email' ],
                '$first_name' => $array[ 'first_name' ],
                'last_name'   => $array[ 'last_name' ],
        ] );
    }
}