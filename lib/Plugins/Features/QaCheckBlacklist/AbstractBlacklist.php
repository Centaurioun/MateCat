<?php

namespace Features\QaCheckBlacklist;

abstract class AbstractBlacklist {

    /**
     * @var string
     */
    protected $file_path;

    /**
     * @var string
     */
    protected $id_job;

    /**
     * @var \Predis\Client
     */
    protected $redis ;

    public function __construct( $path, $id_job ) {
        $this->file_path = $path;
        $this->id_job    = $id_job;

        $this->redis = new \Predis\Client( \INIT::$REDIS_SERVERS );
    }

    abstract public function getContent();

    protected abstract function deleteOriginalFile ( $file_path ); // ???? Va cancellato???

    /**
     * Ensure cache in Redis
     */
    private function ensureCached() {
        $redis   = new \Predis\Client( \INIT::$REDIS_SERVERS );
        $key     = $this->getJobCacheKey();

        if ( !$redis->exists( $key ) ) {
            $content = static::getContent();

            $splitted = explode( PHP_EOL, $content );
            foreach ( $splitted as $token ) {
                $token = trim( $token );
                $redis->sadd( $key, $token );
            }
            $this->redis->expire( $key, 60 * 60 * 24 * 30 ) ;
        }
    }

    /**
     * getMatches 
     *
     * @param $string
     *
     * @return array
     */
    public function getMatches( $string ) {
        $this->ensureCached();

        $redis           = new \Predis\Client( \INIT::$REDIS_SERVERS );
        $blacklist_rows = $redis->smembers( $this->getJobCacheKey() ) ;

        $counter = [];

        foreach($blacklist_rows as $blacklist_item) {
            $blacklist_item = trim( $blacklist_item ) ; 
            
            if ( strlen( $blacklist_item ) == 0 ) { 
                continue ; 
            }
                
            $quoted = preg_quote( $blacklist_item );
            $matches = preg_match_all("/\\b$quoted\\b/u", $string) ;

            if ( $matches > 0 ) {
                $counter[ $blacklist_item ]  = $matches;
            }
        }

        return $counter;
    }

    public function getCached() {
        $this->ensureCached();
    }

    private function getJobCacheKey() {
        return "blacklist:id_job:{$this->id_job}";
    }
}