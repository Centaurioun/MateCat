import ConfirmMessageModal from './es6/components/modals/ConfirmMessageModal'
import SegmentActions from './es6/actions/SegmentActions'
import ModalsActions from './es6/actions/ModalsActions'

window.Review = {
  enabled: function () {
    return config.enableReview && !!config.isReview
  },
  type: config.reviewType,
}
$.extend(window.UI, {
  evalOpenableSegment: function (segment) {
    if (!(segment.status === 'NEW' || segment.status === 'DRAFT')) return true

    if (UI.projectStats && UI.projectStats.TRANSLATED_PERC === 0) {
      alertNoTranslatedSegments()
    } else {
      alertNotTranslatedYet(segment.sid)
    }
    return false
  },
})

window.alertNotTranslatedYet = function (sid) {
  ModalsActions.showModalComponent(ConfirmMessageModal, {
    cancelText: 'Close',
    successCallback: () => UI.openNextTranslated(sid),
    successText: 'Open next translated segment',
    text: UI.alertNotTranslatedMessage,
  })
}

window.alertNoTranslatedSegments = function () {
  var props = {
    text: 'There are no translated segments to revise in this job.',
    successText: 'Ok',
    successCallback: function () {
      ModalsActions.onCloseModal()
    },
  }
  ModalsActions.showModalComponent(ConfirmMessageModal, props, 'Warning')
}

if (config.enableReview && config.isReview) {
  ;(function ($) {
    $.extend(UI, {
      alertNotTranslatedMessage:
        'This segment is not translated yet.<br /> Only translated segments can be revised.',
      /**
       * Each revision overwrite this function
       */
      clickOnApprovedButton: function (segment, goToNextNotApproved) {
        var sid = segment.sid
        SegmentActions.removeClassToSegment(sid, 'modified')
        var afterApproveFn = function () {
          if (goToNextNotApproved) {
            UI.openNextTranslated()
          } else {
            UI.gotoNextSegment(sid)
          }
        }

        UI.changeStatus(segment, 'approved', afterApproveFn) // this does < setTranslation
      },
    })
  })(jQuery)
}
