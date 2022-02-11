import React, {
  createContext,
  createRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import PropTypes from 'prop-types'
import Immutable from 'immutable'
import ReactDOMServer from 'react-dom/server'
import VirtualList from '../common/VirtualList/VirtualList'
import RowSegment from '../common/VirtualList/Rows/RowSegment'
import SegmentStore from '../../stores/SegmentStore'
import SegmentConstants from '../../constants/SegmentConstants'
import CatToolConstants from '../../constants/CatToolConstants'
import CatToolStore from '../../stores/CatToolStore'
import Speech2Text from '../../utils/speech2text'
import SegmentActions from '../../actions/SegmentActions'
import {isUndefined} from 'lodash'
import TagUtils from '../../utils/tagUtils'
import SegmentUtils from '../../utils/segmentUtils'

const ROW_HEIGHT = 90
const OVERSCAN = 5

export const SegmentsContext = createContext({})
const listRef = createRef()

function SegmentsContainer_({
  isReview,
  isReviewExtended,
  reviewType,
  enableTagProjection,
  tagModesEnabled,
  startSegmentId,
}) {
  const [segments, setSegments] = useState(Immutable.fromJS([]))
  const [rows, setRows] = useState([])
  const [updateRowHeight, setUpdateRowHeight] = useState(undefined)
  const [widthArea, setWidthArea] = useState(0)
  const [heightArea, setHeightArea] = useState(0)
  const [startIndex, setStartIndex] = useState(0)
  const [stopIndex, setStopIndex] = useState(0)
  const [scrollToOffset, setScrollToOffset] = useState(undefined)
  const [isSideOpen, setIsSideOpen] = useState(false)
  const [scrollToSid, setScrollToSid] = useState(startSegmentId)
  const [scrollToSelected, setScrollToSelected] = useState(false)
  const [lastSelectedSegment, setLastSelectedSegment] = useState(undefined)
  const [files, setFiles] = useState(CatToolStore.getJobFilesInfo())

  const previousRowsInfo = useRef({length: 0, firstRowHeight: 0})
  const persistenceVariabled = useRef({
    lastScrolled: undefined,
    scrollDirectionTop: false,
    lastScrollTop: 0,
    segmentsWithCollectionType: [],
  })
  const rowsRenderedHeight = useRef(new Map())
  const cachedRowsHeightMap = useRef(new Map())

  const scrollToParams = useMemo(() => {
    const position = scrollToSelected ? 'auto' : 'start'
    const ROWS_LENGTH = rows.length
    if (scrollToSid && ROWS_LENGTH > 0) {
      const index = rows.findIndex(({segImmutable: segment}) => {
        if (scrollToSid.toString().indexOf('-') === -1) {
          return parseInt(segment.get('sid')) === parseInt(scrollToSid)
        } else {
          return segment.get('sid') === scrollToSid
        }
      })

      const {current: persistance} = persistenceVariabled
      let scrollTo
      if (scrollToSelected) {
        scrollTo =
          scrollToSid < persistance.lastScrolled ? index - 1 : index + 1
        scrollTo = index > ROWS_LENGTH - 2 || index === 0 ? index : scrollTo
        persistance.lastScrolled = scrollToSid
        return {scrollTo: scrollTo, position: position}
      }
      scrollTo = index >= 2 ? index - 2 : index === 0 ? 0 : index - 1
      scrollTo = index > ROWS_LENGTH - 8 ? index : scrollTo
      if (scrollTo > 0 || scrollTo < ROWS_LENGTH - 8) {
        //if the opened segments is too big for the view dont show the previous
        const scrollToHeight = rows[index]?.height ?? 0
        const segmentBefore1 = rows[index - 1]?.height ?? 0
        const segmentBefore2 = rows[index - 2]?.height ?? 0
        const totalHeight = segmentBefore1 + segmentBefore2 + scrollToHeight
        if (totalHeight > heightArea - 50) {
          if (scrollToHeight + segmentBefore1 < heightArea + 50) {
            return {scrollTo: index - 1, position: position}
          }
          return {scrollTo: index, position: position}
        }
      }
      return {scrollTo: scrollTo, position: position}
    } /* else if (previousRowsInfo.current < ROWS_LENGTH && scrollDirectionTop) {
      const diff = ROWS_LENGTH - previousRowsInfo.current
      console.log('diff', diff)
      return {
        scrollTo: diff,
        position: position,
      }
    } */
    return {scrollTo: null, position: null}
  }, [rows, heightArea, scrollToSelected, scrollToSid])

  const onChangeRowHeight = useCallback((id, newHeight) => {
    /* setRows((prevState) =>
      prevState.map((row) =>
        row.id === id
          ? {
              ...row,
              height: newHeight,
            }
          : row,
      ),
    ) */
    rowsRenderedHeight.current.set(id, newHeight)
    setUpdateRowHeight(Symbol())
  }, [])

  const getSegmentRealHeight = useCallback(
    ({segment, previousSegment}) => {
      console.log('----> get height', segment.get('sid'))
      const container = document.createElement('div', {})
      const html = getSegmentStructure(segment.toJS(), isSideOpen)
      container.innerHTML = ReactDOMServer.renderToStaticMarkup(html)
      document.getElementById('outer').appendChild(container)
      const height = container.getElementsByTagName('section')[0].clientHeight
      container.parentNode.removeChild(container)

      const getBasicSize = ({segment, previousSegment}) => {
        let basicSize = 0
        // if is the first segment of a file, add the 43px of the file header
        const previousFileId = previousSegment
          ? previousSegment.get('id_file')
          : 0
        const isFirstSegment =
          files && segment.get('sid') === files[0].first_segment
        const fileDivHeight = isFirstSegment ? 60 : 75
        const collectionDivHeight = isFirstSegment ? 35 : 50
        if (previousFileId !== segment.get('id_file')) {
          basicSize += fileDivHeight
        }
        // if it's collection type add 42px of header
        if (
          persistenceVariabled.current.segmentsWithCollectionType.indexOf(
            segment.get('sid'),
          ) !== -1
        ) {
          basicSize += collectionDivHeight
        }
        return basicSize
      }

      const realHeight = height + getBasicSize({segment, previousSegment})
      return realHeight > ROW_HEIGHT ? realHeight : ROW_HEIGHT
    },
    [isSideOpen, files],
  )

  const setBulkSelection = useCallback(
    (sid, fid) => {
      const lastSelectedSegmentSid = isUndefined(lastSelectedSegment)
        ? sid
        : lastSelectedSegment.sid

      const from = Math.min(sid, lastSelectedSegmentSid)
      const to = Math.max(sid, lastSelectedSegmentSid)

      SegmentActions.setBulkSelectionInterval(from, to, fid)
    },
    [lastSelectedSegment],
  )

  const onScroll = useCallback(() => {
    if (!listRef?.current || scrollToSid || scrollToOffset) return

    const scrollValue = listRef.current.scrollTop
    const scrollBottomValue =
      listRef.current.firstChild.offsetHeight -
      (scrollValue + listRef.current.offsetHeight)

    const {current: persistance} = persistenceVariabled
    persistance.scrollDirectionTop = scrollValue < persistance.lastScrollTop

    if (scrollBottomValue < 700 && !persistance.scrollDirectionTop) {
      UI.getMoreSegments('after')
    } else if (scrollValue < 500 && persistance.scrollDirectionTop) {
      UI.getMoreSegments('before')
    }
    persistance.lastScrollTop = scrollValue
  }, [scrollToSid, scrollToOffset])

  const resetScrollTo = useCallback(() => {
    setScrollToSid(undefined)
    setScrollToOffset(undefined)
    previousRowsInfo.current = {
      length: rows.length,
      firstRowHeight: rows[0].height,
    }
  }, [rows])

  // set width and height of area
  useEffect(() => {
    const onWindowResize = () => {
      const headerHeight =
        document.getElementsByTagName('header')[0].offsetHeight
      const footerHeight =
        document.getElementsByTagName('footer')[0].offsetHeight

      setWidthArea(window.innerWidth)
      setHeightArea(window.innerHeight - (headerHeight + footerHeight))
    }

    onWindowResize()
    window.addEventListener('resize', onWindowResize)

    return () => window.removeEventListener('resize', onWindowResize)
  }, [])

  // add actions listener
  useEffect(() => {
    const renderSegments = (segments) => {
      setSegments(segments)
    }
    const updateAllSegments = () => {}
    const scrollToSegment = (sid) => {
      persistenceVariabled.current.lastScrolled = sid
      setScrollToSid(sid)
      setScrollToSelected(false)
      // setTimeout(() => this.onScroll(), 500)
    }
    const scrollToSelectedSegment = (sid) => {
      setScrollToSid(sid)
      setScrollToSelected(true)
    }
    const openSide = () => {}
    const closeSide = () => {}
    const storeJobInfo = (files) => setFiles(files)

    SegmentStore.addListener(SegmentConstants.RENDER_SEGMENTS, renderSegments)
    SegmentStore.addListener(
      SegmentConstants.UPDATE_ALL_SEGMENTS,
      updateAllSegments,
    )
    SegmentStore.addListener(
      SegmentConstants.SCROLL_TO_SEGMENT,
      scrollToSegment,
    )
    SegmentStore.addListener(
      SegmentConstants.SCROLL_TO_SELECTED_SEGMENT,
      scrollToSelectedSegment,
    )
    SegmentStore.addListener(SegmentConstants.OPEN_SIDE, openSide)
    SegmentStore.addListener(SegmentConstants.CLOSE_SIDE, closeSide)

    /* SegmentStore.addListener(
        SegmentConstants.RECOMPUTE_SIZE,
        recomputeListSize,
      )
      SegmentStore.addListener(
        SegmentConstants.FORCE_UPDATE,
        forceUpdateSegments,
      ) */
    CatToolStore.addListener(CatToolConstants.STORE_FILES_INFO, storeJobInfo)

    return () => {
      SegmentStore.removeListener(
        SegmentConstants.RENDER_SEGMENTS,
        renderSegments,
      )
      SegmentStore.removeListener(
        SegmentConstants.UPDATE_ALL_SEGMENTS,
        updateAllSegments,
      )
      SegmentStore.removeListener(
        SegmentConstants.SCROLL_TO_SEGMENT,
        scrollToSegment,
      )
      SegmentStore.removeListener(
        SegmentConstants.SCROLL_TO_SELECTED_SEGMENT,
        scrollToSelectedSegment,
      )
      SegmentStore.removeListener(SegmentConstants.OPEN_SIDE, openSide)
      SegmentStore.removeListener(SegmentConstants.CLOSE_SIDE, closeSide)
      CatToolStore.removeListener(
        CatToolConstants.STORE_FILES_INFO,
        storeJobInfo,
      )
    }
  }, [])

  // set list rows
  useEffect(() => {
    if (!segments) return

    const getSegmentProps = (
      segment,
      segImmutable,
      currentFileId,
      collectionTypeSeparator,
    ) => {
      return {
        segment,
        segImmutable,
        timeToEdit: config.time_to_edit_enabled,
        isReview,
        isReviewExtended: !!isReviewExtended,
        reviewType,
        enableTagProjection,
        tagModesEnabled,
        speech2textEnabledFn: Speech2Text.enabled,
        setLastSelectedSegment: (sid) => setLastSelectedSegment({sid}),
        setBulkSelection,
        sideOpen: isSideOpen,
        files: files,
        currentFileId: currentFileId.toString(),
        collectionTypeSeparator,
      }
    }

    const getCollectionType = (segment) => {
      let collectionType
      if (segment.notes) {
        segment.notes.forEach(function (item) {
          if (item.note && item.note !== '') {
            if (item.note.indexOf('Collection Name: ') !== -1) {
              let split = item.note.split(': ')
              if (split.length > 1) {
                collectionType = split[1]
              }
            }
          }
        })
      }
      return collectionType
    }

    //
    let currentFileId = 0
    const collectionsTypeArray = []

    setRows((prevState) =>
      new Array(segments.size).fill({}).map((item, index) => {
        const segImmutable = segments.get(index)
        const segment = segImmutable.toJS()
        const collectionType = getCollectionType(segment)
        let collectionTypeSeparator
        if (
          collectionType &&
          collectionsTypeArray.indexOf(collectionType) === -1
        ) {
          let classes = isSideOpen ? 'slide-right' : ''
          const isFirstSegment = files && segment.sid === files[0].first_segment
          classes = isFirstSegment ? classes + ' first-segment' : classes
          collectionTypeSeparator = (
            <div
              className={'collection-type-separator ' + classes}
              key={collectionType + segment.sid + Math.random() * 10}
            >
              Collection Name: <b>{collectionType}</b>
            </div>
          )
          collectionsTypeArray.push(collectionType)
          const {segmentsWithCollectionType} = persistenceVariabled.current
          if (segmentsWithCollectionType.indexOf(segment.sid) === -1) {
            segmentsWithCollectionType.push(segment.sid)
          }
        }
        const segmentProps = getSegmentProps(
          segment,
          segImmutable,
          currentFileId,
          collectionTypeSeparator,
        )
        currentFileId = segment.id_file

        return {
          id: segment.sid,
          height:
            prevState.find(({id}) => id === segment.sid)?.height ?? ROW_HEIGHT,
          hasRendered:
            prevState.find(({id}) => id === segment.sid)?.hasRendered ?? false,
          ...segmentProps,
        }
      }),
    )
  }, [
    segments,
    isSideOpen,
    files,
    isReviewExtended,
    enableTagProjection,
    isReview,
    reviewType,
    tagModesEnabled,
    setBulkSelection,
  ])

  // cache rows height before start index
  useEffect(() => {
    if (startIndex === undefined || !stopIndex) return
    setRows((prevState) => {
      // update with new height
      const updated = prevState.map((row) =>
        rowsRenderedHeight.current.get(row.id)
          ? {
              ...row,
              height: rowsRenderedHeight.current.get(row.id),
              hasRendered: true,
            }
          : row,
      )
      // rendered rows
      const rowsRendered = updated.filter(
        (row, index) => index >= startIndex && index <= stopIndex,
      )
      const haveRowsRenderedHeight = !rowsRendered.find(
        ({hasRendered}) => !hasRendered,
      )

      // update cache map
      if (haveRowsRenderedHeight) {
        rowsRendered.forEach(
          ({id, height, segment}) =>
            !segment.opened && cachedRowsHeightMap.current.set(id, height),
        )
      }

      // rows before start index
      const rowsBeforeStartIndex = (
        haveRowsRenderedHeight
          ? updated.filter((row, index) => index < startIndex)
          : []
      ).map((row, index) => {
        const cached = cachedRowsHeightMap.current.get(row.id)
          ? cachedRowsHeightMap.current.get(row.id)
          : row.hasRendered
          ? row.height
          : false
        const newHeight = !cached
          ? getSegmentRealHeight({
              segment: row.segImmutable,
              previousSegment:
                index > 0 ? updated[index - 1].segImmutable : undefined,
            })
          : cached
        cachedRowsHeightMap.current.set(row.id, newHeight)
        return {...row, height: newHeight}
      })

      const nextState = haveRowsRenderedHeight
        ? updated.map((row, index) =>
            index > stopIndex
              ? row
              : {
                  ...row,
                  height:
                    rowsBeforeStartIndex.find(({id}) => id === row.id)
                      ?.height ?? row.height,
                },
          )
        : updated

      /* console.log('#### ->', rowsBeforeStartIndex)
      console.log('@ ->', rowsRendered) */

      // console.log('#', nextState)
      /*console.log(
        '[',
        nextState.reduce((acc, curr) => acc + curr.height, 0),
      ) */
      return nextState
    })
  }, [startIndex, stopIndex, updateRowHeight, getSegmentRealHeight])

  useEffect(() => {
    if (!rows.length || !previousRowsInfo?.current) return
    const {length, firstRowHeight} = previousRowsInfo.current
    const {scrollDirectionTop} = persistenceVariabled.current
    if (length < rows.length && scrollDirectionTop) {
      // const haveRowsRenderedHeight = !rows.find(({height}) => height === 0)
      // if (haveRowsRenderedHeight) {
      const stopIndex = rows.length - length
      const newEntriesHeight = rows
        .filter((row, index) => index >= 0 && index < stopIndex)
        .reduce((acc, {height}) => acc + height, 0)
      console.log('newEntriesHeight', newEntriesHeight)
      console.log(rows.filter((row, index) => index >= 0 && index < stopIndex))
      console.log(
        'rows[stopIndex].height',
        rows[stopIndex].height,
        'firstRowHeight',
        firstRowHeight,
        'stopIndex',
        stopIndex,
      )
      console.log('---------------------------')
      const scrollOffset =
        newEntriesHeight /* + (rows[stopIndex].height - firstRowHeight) */
      console.log('scrollOffset', scrollOffset)
      setScrollToOffset(scrollOffset)
      // }
    }
  }, [rows])

  // reset scrollTo and cache previous rows info
  useEffect(() => {
    if (!rows.length) return
    const rowsBeforeStartIndex = rows.filter((row, index) => index < startIndex)
    const haveCachedRowsBeforeStartIndex = rowsBeforeStartIndex.length
      ? rowsBeforeStartIndex.every(({id}) =>
          cachedRowsHeightMap.current.get(id),
        )
      : false
    if (!haveCachedRowsBeforeStartIndex) return

    const haveRowsRenderedHeight = !rows.find(({height}) => height === 0)
    if (haveRowsRenderedHeight) resetScrollTo()
  }, [rows, startIndex, stopIndex, resetScrollTo])

  // safe force reset scrollTo
  useEffect(() => {
    if (!scrollToSid) return
    const timeout = setTimeout(() => resetScrollTo(), 500)

    return () => clearTimeout(timeout)
  }, [scrollToSid, resetScrollTo])

  useEffect(() => {
    console.log('####', scrollToSid)
  }, [scrollToSid])

  /* useEffect(() => {
    if (startIndex === undefined || !stopIndex) return
    const rowsRendered = rows.filter(
      (row, index) => index >= startIndex && index <= stopIndex,
    )
    rowsRendered.forEach(
      ({id, height, segment}) =>
        !segment.opened && height > 0 && cachedRowsHeightMap.set(id, height),
    )
  }, [startIndex, stopIndex, rows]) */

  //cache rows height before start index
  /* useEffect(() => {
    if (startIndex === undefined) return
    console.log(startIndex)
    segments
      .toJS()
      .filter((segment, index) => index < startIndex)
      .forEach(({sid}, index) => {
        const cached = cachedRowsHeightMap.get(sid)
        cachedRowsHeightMap.set(
          sid,
          !cached
            ? getSegmentRealHeight({
                segment: segments.get(index),
                previousSegment:
                  index > 0 ? segments.get(index - 1) : undefined,
              })
            : cached,
        )
        setRows((prevState) =>
          prevState.map((row) => ({
            ...row,
            height:
              !row.segment.opened && cachedRowsHeightMap.get(row.id)
                ? cachedRowsHeightMap.get(row.id)
                : row.height,
          })),
        )
      })
  }, [segments, startIndex, getSegmentRealHeight]) */

  return (
    <SegmentsContext.Provider
      value={{onChangeRowHeight, minRowHeight: ROW_HEIGHT}}
    >
      <VirtualList
        ref={listRef}
        items={rows}
        scrollToIndex={{
          value: scrollToParams.scrollTo,
          align: scrollToParams.position,
        }}
        scrollToOffset={{
          value: scrollToOffset,
        }}
        overscan={OVERSCAN}
        onScroll={onScroll}
        Component={RowSegment}
        itemStyle={({segment}) => segment.opened && {zIndex: 1}}
        width={widthArea}
        height={heightArea}
        renderedRange={(range) => {
          setStartIndex(range[0])
          setStopIndex(range[range.length - 1])
        }}
      />
    </SegmentsContext.Provider>
  )
}

SegmentsContainer_.propTypes = {
  isReview: PropTypes.bool,
  isReviewExtended: PropTypes.bool,
  reviewType: PropTypes.string,
  enableTagProjection: PropTypes.any,
  tagModesEnabled: PropTypes.bool,
  startSegmentId: PropTypes.string,
}

export default SegmentsContainer_

// Segment structure placeholder
const getSegmentStructure = (segment, sideOpen) => {
  let source = segment.segment
  let target = segment.translation
  if (SegmentUtils.checkCurrentSegmentTPEnabled(segment)) {
    source = TagUtils.removeAllTags(source)
    target = TagUtils.removeAllTags(target)
  }

  source = TagUtils.matchTag(
    TagUtils.decodeHtmlInTag(
      TagUtils.decodePlaceholdersToTextSimple(source),
      config.isSourceRTL,
    ),
  )
  target = TagUtils.matchTag(
    TagUtils.decodeHtmlInTag(
      TagUtils.decodePlaceholdersToTextSimple(target),
      config.isSourceRTL,
    ),
  )

  return (
    <section
      className={`status-draft ${sideOpen ? 'slide-right' : ''}`}
      ref={(section) => (this.section = section)}
    >
      <div className="sid">
        <div className="txt">0000000</div>
        <div className="txt segment-add-inBulk">
          <input type="checkbox" />
        </div>
        <div className="actions">
          <button className="split" title="Click to split segment">
            <i className="icon-split"> </i>
          </button>
          <p className="split-shortcut">CTRL + S</p>
        </div>
      </div>

      <div className="body">
        <div className="header toggle"> </div>
        <div
          className="text segment-body-content"
          style={{boxSizing: 'content-box'}}
        >
          <div className="wrap">
            <div className="outersource">
              <div
                className="source item"
                tabIndex="0"
                dangerouslySetInnerHTML={{__html: source}}
              />
              <div className="copy" title="Copy source to target">
                <a href="#"> </a>
                <p>CTRL+I</p>
              </div>
              <div className="target item">
                <div className="textarea-container">
                  <div
                    className="targetarea editarea"
                    spellCheck="true"
                    dangerouslySetInnerHTML={{__html: target}}
                  />
                  <div className="toolbar">
                    <a
                      className="revise-qr-link"
                      title="Segment Quality Report."
                      target="_blank"
                      href="#"
                    >
                      QR
                    </a>
                    <a
                      href="#"
                      className="tagModeToggle "
                      title="Display full/short tags"
                    >
                      <span className="icon-chevron-left"> </span>
                      <span className="icon-tag-expand"> </span>
                      <span className="icon-chevron-right"> </span>
                    </a>
                    <a
                      href="#"
                      className="autofillTag"
                      title="Copy missing tags from source to target"
                    >
                      {' '}
                    </a>
                    <ul className="editToolbar">
                      <li className="uppercase" title="Uppercase">
                        {' '}
                      </li>
                      <li className="lowercase" title="Lowercase">
                        {' '}
                      </li>
                      <li className="capitalize" title="Capitalized">
                        {' '}
                      </li>
                    </ul>
                  </div>
                </div>
                <p className="warnings"> </p>
                <ul className="buttons toggle">
                  <li>
                    <a href="#" className="translated">
                      {' '}
                      Translated{' '}
                    </a>
                    <p>CTRL ENTER</p>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="status-container">
            <a href="#" className="status no-hover">
              {' '}
            </a>
          </div>
        </div>
        <div className="timetoedit" data-raw-time-to-edit="0">
          {' '}
        </div>
        <div className="edit-distance">Edit Distance:</div>
      </div>
      <div className="segment-side-buttons">
        <div
          data-mount="translation-issues-button"
          className="translation-issues-button"
        >
          {' '}
        </div>
      </div>
      <div className="segment-side-container"> </div>
    </section>
  )
}
