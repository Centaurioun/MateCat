<?php
/**
 * Created by PhpStorm.
 * User: vincenzoruffa
 * Date: 09/09/2020
 * Time: 19:34
 */

namespace Files;

use DataAccess_IDaoStruct;
use Database;

class MetadataDao extends \DataAccess_AbstractDao {

    const TABLE = 'file_metadata';

    /**
     * @param     $id_project
     * @param     $id_file
     * @param int $ttl
     *
     * @return DataAccess_IDaoStruct[]
     */
    public function getByJobIdProjectAndIdFile( $id_project, $id_file, $ttl = 0 ) {
        $stmt = $this->_getStatementForCache(
                "SELECT * FROM " . self::TABLE . " WHERE " .
                " id_project = :id_project " .
                " AND id_file = :id_file "
        );

        $result = $this->setCacheTTL( $ttl )->_fetchObject( $stmt, new MetadataStruct(), [
                'id_project' => $id_project,
                'id_file'    => $id_file,
        ] );

        return @$result;
    }

    /**
     * @param      $id_project
     * @param      $id_file
     * @param      $key
     * @param null $filePartsId
     * @param int  $ttl
     *
     * @return MetadataStruct
     */
    public function get( $id_project, $id_file, $key, $filePartsId = null, $ttl = 0 ) {

        $query = "SELECT * FROM " . self::TABLE . " WHERE " .
                " id_project = :id_project " .
                " AND id_file = :id_file " .
                " AND `key` = :key ";

        $params = [
            'id_project' => $id_project,
            'id_file'    => $id_file,
            'key'        => $key
        ];

        if($filePartsId){
            $query .= " AND `files_parts_id` = :files_parts_id";
            $params['files_parts_id'] = $filePartsId;
        }

        $stmt = $this->_getStatementForCache($query);

        return @$this->setCacheTTL( $ttl )->_fetchObject( $stmt, new MetadataStruct(), $params )[ 0 ];
    }


    public function insert( $id_project, $id_file, $key, $value, $filePartsId = null ) {

        $sql = "INSERT INTO file_metadata " .
                " ( id_project, id_file, `key`, `value`, `files_parts_id` ) " .
                " VALUES " .
                " ( :id_project, :id_file, :key, :value, :files_parts_id ); ";

        $conn = Database::obtain()->getConnection();
        $stmt = $conn->prepare( $sql );
        $stmt->execute( [
                'id_project'     => $id_project,
                'id_file'        => $id_file,
                'files_parts_id' => $filePartsId,
                'key'            => $key,
                'value'          => $value
        ] );

        return $this->get( $id_project, $id_file, $key, $filePartsId );
    }


    public function update( $id_project, $id_file, $key, $value, $filePartsId = null ) {

        $sql = "UPDATE file_metadata SET `value` = :value WHERE id_project = :id_project AND id_file = :id_file AND `key` = :key AND `files_parts_id` = :files_parts_id ";

        $conn = Database::obtain()->getConnection();
        $stmt = $conn->prepare( $sql );
        $stmt->execute( [
                'id_project'     => $id_project,
                'id_file'        => $id_file,
                'files_parts_id' => $filePartsId,
                'key'            => $key,
                'value'          => $value
        ] );

        return $this->get( $id_project, $id_file, $key, $filePartsId );
    }
}