import ConfirmMessageModal from '../components/modals/ConfirmMessageModal'
import DQFModal from '../components/modals/DQFModal'
import SplitJobModal from '../components/modals/SplitJob'
import CreateTeamModal from '../components/modals/CreateTeam'
import ModifyTeamModal from '../components/modals/ModifyTeam'
import {mergeJobChunks} from '../api/mergeJobChunks'
import AppDispatcher from '../stores/AppDispatcher'
import ModalsConstants from '../constants/ModalsConstants'

let ModalsActions = {
  showModalComponent: (component, props, title, style, onCloseCallback) => {
    AppDispatcher.dispatch({
      actionType: ModalsConstants.SHOW_MODAL,
      component,
      props,
      title,
      style,
      onCloseCallback,
    })
  },
  onCloseModal: function () {
    AppDispatcher.dispatch({
      actionType: ModalsConstants.CLOSE_MODAL,
    })
  },
  openCreateTeamModal: function () {
    this.showModalComponent(CreateTeamModal, {}, 'Create New Team')
  },
  openModifyTeamModal: function (team, hideChangeName) {
    var props = {
      team: team,
      hideChangeName: hideChangeName,
    }
    this.showModalComponent(ModifyTeamModal, props, 'Modify Team')
  },

  openSplitJobModal: function (job, project, callback) {
    var props = {
      job: job,
      project: project,
      callback: callback,
    }
    var style = {width: '670px', maxWidth: '670px'}
    this.showModalComponent(SplitJobModal, props, 'Split Job', style)
  },
  openMergeModal: function (project, job, successCallback) {
    var props = {
      text:
        'This will cause the merging of all chunks in only one job. ' +
        'This operation cannot be canceled.',
      successText: 'Continue',
      successCallback: function () {
        mergeJobChunks(project, job).then(function () {
          if (successCallback) {
            successCallback.call()
          }
        })
        this.onCloseModal()
      },
      cancelText: 'Cancel',
      cancelCallback: function () {
        this.onCloseModal()
      },
    }
    this.showModalComponent(ConfirmMessageModal, props, 'Confirmation required')
  },

  openDQFModal: function () {
    var props = {
      metadata: APP.USER.STORE.metadata ? APP.USER.STORE.metadata : {},
    }
    var style = {width: '670px', maxWidth: '670px'}
    this.showModalComponent(DQFModal, props, 'DQF Preferences', style)
  },
}

export default ModalsActions
