import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import SegmentStore from '../../../stores/SegmentStore'
import {GlossaryItem} from './GlossaryItem'
import {TabGlossaryContext} from './TabGlossaryContext'
import SegmentConstants from '../../../constants/SegmentConstants'
import _ from 'lodash'
import SegmentActions from '../../../actions/SegmentActions'

const setIntervalCounter = ({callback, delay, maximumNumOfTime}) => {
  let count = 0
  let interval

  const reset = () => {
    clearInterval(interval)
    count = 0
  }

  const set = ({callback, delay, maximumNumOfTime}) => {
    reset()
    interval = setInterval(() => {
      if (
        typeof maximumNumOfTime === 'number' &&
        count > maximumNumOfTime - 1
      ) {
        reset()
        return
      }

      const result = callback()
      count++

      if (result) reset()
    }, delay)
  }

  set({callback, delay, maximumNumOfTime})
}

const GlossaryList = () => {
  const {
    terms,
    searchTerm,
    previousSearchTermRef,
    isLoading,
    setSearchTerm,
    segment,
    keys,
    setShowForm,
    setModifyElement,
    setShowMore,
    setSelectsActive,
    domains,
    subdomains,
    getRequestPayloadTemplate,
    termsStatusDeleting,
    setTermsStatusDeleting,
  } = useContext(TabGlossaryContext)

  const [termHighlight, setTermHighlight] = useState(undefined)

  const scrollItemsRef = useRef()

  const scrollToTerm = useCallback(
    async ({id, isTarget, type}) => {
      if (!id || !scrollItemsRef.current) return
      // reset search results
      setSearchTerm('')

      await new Promise((resolve) => {
        if (
          !_.isEqual(
            segment.glossary.map(({term_id}) => term_id),
            segment.glossary_search_results.map(({term_id}) => term_id),
          )
        ) {
          setIntervalCounter({
            callback: () => {
              if (scrollItemsRef.current?.children.length) {
                resolve()
                return true
              }
            },
            delay: 100,
            maximumNumOfTime: 5,
          })
        } else {
          resolve()
        }
      })
      const indexToScroll = Array.from(
        scrollItemsRef.current?.children,
      ).findIndex((element) => element.getAttribute('id') === id)

      const element = scrollItemsRef.current?.children[indexToScroll]

      if (element) {
        await new Promise((resolve) => {
          setIntervalCounter({
            callback: () => {
              if (element.offsetHeight) {
                resolve()
                return true
              }
            },
            delay: 100,
            maximumNumOfTime: 5,
          })
        })

        scrollItemsRef.current.scrollTo(0, indexToScroll * element.offsetHeight)
        setTermHighlight({index: indexToScroll, isTarget, type})
        const labelElement =
          element.getElementsByClassName('glossary_word')[isTarget ? 1 : 0]
        labelElement.onanimationend = () => setTermHighlight(undefined)
      }
    },
    [segment.glossary, segment.glossary_search_results, setSearchTerm],
  )

  // register listener highlight term
  useEffect(() => {
    const highlightTerm = ({sid, termId, isTarget, type}) => {
      if (sid === segment.sid) scrollToTerm({id: termId, isTarget, type})
    }

    SegmentStore.addListener(
      SegmentConstants.HIGHLIGHT_GLOSSARY_TERM,
      highlightTerm,
    )

    return () => {
      SegmentStore.removeListener(
        SegmentConstants.HIGHLIGHT_GLOSSARY_TERM,
        highlightTerm,
      )
    }
  }, [scrollToTerm, segment.sid])

  useEffect(() => {
    if (!segment?.glossary_search_results) return
    if (scrollItemsRef?.current) scrollItemsRef.current.scrollTo(0, 0)
  }, [segment?.glossary_search_results])

  const onModifyItem = (term) => {
    setShowMore(true)
    setShowForm(true)
    setModifyElement(term)
    // prefill selects active keys, domain and subdomain
    const {metadata} = term
    setSelectsActive((prevState) => ({
      ...prevState,
      keys: [keys.find(({id}) => id === metadata?.key)],
      domain: domains.find(({name}) => name === metadata?.domain),
      subdomain: subdomains.find(({name}) => name === metadata?.subdomain),
    }))
  }

  const onDeleteItem = (term) => {
    const {term_id, metadata} = term
    setTermsStatusDeleting((prevState) => [...prevState, term_id])
    SegmentActions.deleteGlossaryItem(
      getRequestPayloadTemplate({
        term: {term_id, metadata: {key: metadata.key}},
        isDelete: true,
      }),
    )
  }

  return (
    <div ref={scrollItemsRef} className="glossary_items">
      {terms.map((term, index) => (
        <GlossaryItem
          key={index}
          item={term}
          modifyElement={() => onModifyItem(term)}
          deleteElement={() => onDeleteItem(term)}
          highlight={index === termHighlight?.index && termHighlight}
          isEnabledToModify={
            !!keys.find(({key}) => key === term?.metadata?.key) && !isLoading
          }
          isStatusDeleting={
            !!termsStatusDeleting.find((value) => value === term.term_id)
          }
        />
      ))}
      {!isLoading && !terms.length && (
        <div className="no-terms-result">
          {searchTerm && searchTerm === previousSearchTermRef.current ? (
            <span>
              No results for <b>{searchTerm}</b>
            </span>
          ) : !searchTerm ? (
            <span>No results</span>
          ) : undefined}
        </div>
      )}
    </div>
  )
}

export default GlossaryList
