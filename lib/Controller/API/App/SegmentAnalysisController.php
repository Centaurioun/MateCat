<?php

namespace API\App;

use API\V2\KleinController;
use API\V2\Validators\LoginValidator;
use Features\ReviewExtended\ReviewUtils;
use LQA\EntryDao;
use Url\JobUrlBuilder;
use Exceptions\NotFoundException;

class SegmentAnalysisController extends KleinController {

    const MAX_PER_PAGE = 200;

    /**
     * @var \Chunks_ChunkStruct
     */
    private $chunk;

    /**
     * @var \Projects_ProjectStruct
     */
    private $project;

    protected function afterConstruct() {
        $this->appendValidator( new LoginValidator( $this ) );
    }

    /**
     * Segment list
     * from id project/password
     */
    public function project() {

        $page = ($this->request->param('page')) ? (int)$this->request->param('page') : 1;
        $perPage = ($this->request->param('per_page')) ? (int)$this->request->param('per_page') : 50;

        if($perPage > self::MAX_PER_PAGE){
            $perPage = self::MAX_PER_PAGE;
        }

        $idProject = $this->request->param('id_project');
        $password = $this->request->param('password');

        try {
            $this->project = (new \Projects_ProjectDao())->findByIdAndPassword($idProject, $password);
        } catch (NotFoundException $exception) {
            $this->response->code( 500 );
            $this->response->json( [
                    'error' => [
                            'message' => $exception->getMessage()
                    ]
            ] );
            exit();
        }

        $segmentsCount = 0;

        foreach ($this->project->getJobs() as $job){
            $firstSegment = (int)$job->job_first_segment;
            $lastSegment = (int)$job->job_last_segment;
            $count = $lastSegment - $firstSegment + 1;
            $segmentsCount = $segmentsCount + $count;
        }

        try {
            $this->response->json($this->getSegmentsForAProject($idProject, $password, $page, $perPage, $segmentsCount));
            exit();
        } catch (\Exception $exception){
            $this->response->code( 500 );
            $this->response->json( [
                    'error' => [
                            'message' => $exception->getMessage()
                    ]
            ] );
        }
    }

    /**
     * @param $idProject
     * @param $password
     * @param $page
     * @param $perPage
     * @param $segmentsCount
     *
     * @return array
     * @throws \Exception
     */
    private function getSegmentsForAProject($idProject, $password, $page, $perPage, $segmentsCount)
    {
        $totalPages = ceil($segmentsCount/$perPage);
        $isLast = ((int)$page === (int)$totalPages);

        if($page > $totalPages or $page <= 0){
            throw new \Exception('Page number '.$page.' is not valid');
        }

        $prev = ($page > 1 ) ? "/api/app/projects/".$idProject."/".$password."/segment-analysis?page=".($page-1)."&per_page=".$perPage : null;
        $next = (!$isLast and $totalPages > 1) ? "/api/app/projects/".$idProject."/".$password."/segment-analysis?page=".($page+1)."&per_page=".$perPage : null;
        $items = $this->getSegmentsFromIdProjectAndPassword($idProject, $password, $page, $perPage);

        return [
                '_links' => [
                        'page' => $page,
                        'per_page' => $perPage,
                        'total_pages' => $totalPages,
                        'total_items' => $segmentsCount,
                        'next_page' => $next,
                        'prev_page' => $prev,
                ],
                'items' => $items
        ];
    }

    /**
     * @param $idProject
     * @param $password
     * @param $page
     * @param $perPage
     *
     * @return array
     * @throws \Exception
     */
    private function getSegmentsFromIdProjectAndPassword($idProject, $password, $page, $perPage)
    {
        $segments = [];
        $limit = $perPage;
        $offset = ($page-1)*$perPage;

        $segmentsForAnalysis = \Segments_SegmentDao::getSegmentsForAnalysisFromIdProjectAndPassword($idProject, $password, $limit, $offset, 0);

        foreach ( $segmentsForAnalysis as $segmentForAnalysis ){
            $segments[] = $this->formatSegment($segmentForAnalysis);
        }

        return $segments;
    }

    /**
     * Segment list
     * from id job/password
     */
    public function job() {

        $page = ($this->request->param('page')) ? (int)$this->request->param('page') : 1;
        $perPage = ($this->request->param('per_page')) ? (int)$this->request->param('per_page') : 50;

        if($perPage > self::MAX_PER_PAGE){
            $perPage = self::MAX_PER_PAGE;
        }

        $idJob = $this->request->param('id_job');
        $password = $this->request->param('password');
        $segmentsCount = \Chunks_ChunkDao::getSegmentsCount($idJob, $password, 0);

        try {
            $this->response->json($this->getSegmentsForAJob($idJob, $password, $page, $perPage, $segmentsCount));
            exit();
        } catch (\Exception $exception){
            $this->response->code( 500 );
            $this->response->json( [
                    'error' => [
                            'message' => $exception->getMessage()
                    ]
            ] );
        }
    }

    /**
     * @param $idJob
     * @param $password
     * @param $page
     * @param $perPage
     * @param $segmentsCount
     *
     * @return array
     * @throws \Exception
     */
    private function getSegmentsForAJob( $idJob, $password, $page, $perPage, $segmentsCount)
    {
        $totalPages = ceil($segmentsCount/$perPage);
        $isLast = ((int)$page === (int)$totalPages);

        if($page > $totalPages or $page <= 0){
            throw new \Exception('Page number '.$page.' is not valid');
        }

        $chunk = \Chunks_ChunkDao::getByIdAndPassword($idJob, $password);

        if($chunk === null){
            throw new \Exception('Job not found');
        }

        $this->chunk = $chunk;

        $prev = ($page > 1 ) ? "/api/app/jobs/".$idJob."/".$password."/segment-analysis?page=".($page-1)."&per_page=".$perPage : null;
        $next = (!$isLast and $totalPages > 1) ? "/api/app/jobs/".$idJob."/".$password."/segment-analysis?page=".($page+1)."&per_page=".$perPage : null;
        $items = $this->getSegmentsFromIdJobAndPassword($idJob, $password, $page, $perPage);

        return [
                '_links' => [
                        'page' => $page,
                        'per_page' => $perPage,
                        'total_pages' => $totalPages,
                        'total_items' => $segmentsCount,
                        'next_page' => $next,
                        'prev_page' => $prev,
                ],
                'items' => $items
        ];
    }

    /**
     * @param $idJob
     * @param $password
     * @param $page
     * @param $perPage
     *
     * @return array
     * @throws \Exception
     */
    private function getSegmentsFromIdJobAndPassword($idJob, $password, $page, $perPage)
    {
        $segments = [];
        $limit = $perPage;
        $offset = ($page-1)*$perPage;

        $segmentsForAnalysis = \Segments_SegmentDao::getSegmentsForAnalysisFromIdJobAndPassword($idJob, $password, $limit, $offset, 0);

        foreach ( $segmentsForAnalysis as $segmentForAnalysis ){
            $segments[] = $this->formatSegment($segmentForAnalysis);
        }

        return $segments;
    }

    /**
     * @param \DataAccess_IDaoStruct $segmentForAnalysis
     *
     * @return array
     * @throws \Exception
     */
    private function formatSegment(\DataAccess_IDaoStruct $segmentForAnalysis)
    {
        // urls
        $urls = JobUrlBuilder::createFromCredentials($segmentForAnalysis->id_job, $segmentForAnalysis->job_password, [
                'id_segment' => $segmentForAnalysis->id
        ]);

        // id_request
        $idRequest = \Segments_SegmentMetadataDao::get($segmentForAnalysis->id, 'id_request');

        // issues
        $issues_records = EntryDao::findAllBySegmentId( $segmentForAnalysis->id );
        $issues         = [];
        foreach ( $issues_records as $issue_record ) {
            $issues[] = [
                    'id_category'         => (int)$issue_record->id_category,
                    'severity'            => $issue_record->severity,
                    'translation_version' => (int)$issue_record->translation_version,
                    'penalty_points'      => floatval($issue_record->penalty_points),
                    'created_at'          => date( 'c', strtotime( $issue_record->create_date ) ),
            ];
        }

        // original_filename
        $originalFile = ( null !== $segmentForAnalysis->tag_key and $segmentForAnalysis->tag_key === 'original' ) ? $segmentForAnalysis->tag_value : $segmentForAnalysis->filename;

        return [
                'id_segment' => (int)$segmentForAnalysis->id,
                'id_chunk' => (int)$segmentForAnalysis->id_job,
                'chunk_password' => $segmentForAnalysis->job_password,
                'urls' => $urls->getUrls(),
                'id_request' => ($idRequest) ? $idRequest->meta_value : null,
                'filename' => $segmentForAnalysis->filename,
                'original_filename' => $originalFile,
                'source' => $segmentForAnalysis->segment,
                'target' => $segmentForAnalysis->translation,
                'source_lang' => $segmentForAnalysis->source,
                'target_lang' => $segmentForAnalysis->target,
                'source_raw_word_count' => \CatUtils::segment_raw_word_count( $segmentForAnalysis->segment, $segmentForAnalysis->source ),
                'target_raw_word_count' => \CatUtils::segment_raw_word_count( $segmentForAnalysis->translation, $segmentForAnalysis->target ),
                'match_type' => $this->humanReadableMatchType($segmentForAnalysis->match_type),
                'revision_number' => ($segmentForAnalysis->source_page) ? ReviewUtils::sourcePageToRevisionNumber($segmentForAnalysis->source_page) : null,
                'issues' => $issues,
        ];
    }

    /**
     * @param string $match_type
     *
     * @return string
     */
    public function humanReadableMatchType( $match_type){
        switch ($match_type) {
            case "INTERNAL":
                return 'INTERNAL_MATCHES';

            case "MT":
                return 'MT';

            case "100%":
                return 'TM_100';

            case "100%_PUBLIC":
                return 'TM_100_PUBLIC';

            case "75%-99%":
                return 'TM_75_99';

            case "75%-84%":
                return 'TM_75_84';

            case "85%-94%":
                return 'TM_85_94';

            case "95%-99%":
                return 'TM_95_99';

            case "50%-74%":
                return 'TM_50_74';

            case "NEW":
            case "NO_MATCH":
                return 'NEW';

            case "ICE":
                return 'ICE';

            case "REPETITIONS":
                return 'REPETITIONS';
        }

        return 'NUMBERS_ONLY';
    }
}