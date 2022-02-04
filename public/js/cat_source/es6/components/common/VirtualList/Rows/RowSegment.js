import React, {useContext, useEffect, useMemo, useRef} from 'react'
import PropTypes from 'prop-types'
import Segment from '../../../segments/Segment'
import {SegmentsContext} from '../../../segments/SegmentsContainer'
import useResizeObserver from '../../../../hooks/useResizeObserver'
import CommonUtils from '../../../../utils/commonUtils'

const LinkIcon = () => {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 17 17"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.5604 1.10486C11.2679 0.397428 12.2273 0 13.2278 0C15.3111 0 17 1.68888 17 3.77222C17 4.77267 16.6026 5.73215 15.8951 6.43958L12.3007 10.034L11.4993 9.23264L15.0938 5.63819C15.5886 5.1433 15.8667 4.47209 15.8667 3.77222C15.8667 2.3148 14.6852 1.13333 13.2278 1.13333C12.5279 1.13333 11.8567 1.41136 11.3618 1.90624L7.76736 5.50069L6.96597 4.69931L10.5604 1.10486ZM12.3007 5.50069L5.50069 12.3007L4.69931 11.4993L11.4993 4.69931L12.3007 5.50069ZM5.50069 7.76736L1.90624 11.3618C1.41136 11.8567 1.13333 12.5279 1.13333 13.2278C1.13333 14.6852 2.3148 15.8667 3.77222 15.8667C4.47209 15.8667 5.1433 15.5886 5.63819 15.0938L9.23264 11.4993L10.034 12.3007L6.43958 15.8951C5.73215 16.6026 4.77267 17 3.77222 17C1.68888 17 0 15.3111 0 13.2278C0 12.2273 0.397429 11.2678 1.10486 10.5604L4.69931 6.96597L5.50069 7.76736Z"
        fill="#F2F2F2"
      />
    </svg>
  )
}

function RowSegment({
  id,
  defaultHeight,
  currentFileId,
  collectionTypeSeparator,
  ...restProps
}) {
  const {updateHeightRow} = useContext(SegmentsContext)
  const ref = useRef()
  const {height: newHeight} = useResizeObserver(ref, {defaultHeight})

  useEffect(() => {
    updateHeightRow(id, newHeight)
  }, [id, newHeight, defaultHeight, updateHeightRow])

  const content = useMemo(() => {
    const {segment, files, sideOpen} = restProps
    if (segment.id_file !== currentFileId) {
      const file = files
        ? files.find((file) => file.id == segment.id_file)
        : false
      let classes = sideOpen ? 'slide-right' : ''
      const isFirstSegment = files && segment.sid === files[0].first_segment
      classes = isFirstSegment ? classes + ' first-segment' : classes
      return (
        <React.Fragment>
          <div className={'projectbar ' + classes}>
            {file ? (
              <div className={'projectbar-filename'}>
                <span
                  title={segment.filename}
                  className={
                    'fileFormat ' +
                    CommonUtils.getIconClass(
                      file.file_name.split('.')[
                        file.file_name.split('.').length - 1
                      ],
                    )
                  }
                >
                  {file.file_name}
                </span>
              </div>
            ) : null}
            {file ? (
              <div className="projectbar-wordcounter">
                <span>
                  Payable Words: <strong>{file.weighted_words}</strong>
                </span>
              </div>
            ) : null}
            {file && file.metadata && file.metadata.instructions ? (
              <div
                className={'button-notes'}
                onClick={() => this.openInstructionsModal(segment.id_file)}
              >
                <LinkIcon />
                <span>View notes</span>
              </div>
            ) : null}
          </div>
          {collectionTypeSeparator}
          <Segment {...restProps} />
        </React.Fragment>
      )
    }
    return (
      <React.Fragment>
        {collectionTypeSeparator}
        <Segment {...restProps} />
      </React.Fragment>
    )
  }, [restProps, currentFileId, collectionTypeSeparator])

  return (
    <div ref={ref} className="row">
      {content}
    </div>
  )
}

RowSegment.propTypes = {
  id: PropTypes.string.isRequired,
  defaultHeight: PropTypes.number.isRequired,
  currentFileId: PropTypes.string,
  collectionTypeSeparator: PropTypes.node,
  children: PropTypes.node,
}

export default RowSegment
