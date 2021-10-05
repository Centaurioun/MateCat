import {getMatecatApiDomain} from '../../utils/getMatecatApiDomain'

/**
 * Delete segment issue
 *
 * @param {string} idSegment
 * @param {string} idIssue
 * @param {string} [idJob=config.id_job]
 * @param {string} [reviewPassword=config.review_password]
 * @returns {Promise<object>}
 */
export const deleteSegmentIssue = async (
  idSegment,
  idIssue,
  idJob = config.id_job,
  reviewPassword = config.review_password,
) => {
  const response = await fetch(
    `${getMatecatApiDomain()}api/v2/jobs/${idJob}/${reviewPassword}/segments/${idSegment}/translation-issues/${idIssue}`,
    {
      method: 'DELETE',
      credentials: 'include',
    },
  )

  if (!response.ok) return Promise.reject(response)
  return response
}
