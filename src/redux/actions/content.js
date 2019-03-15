import * as ACTIONS from 'constants/action_types';

export function savePosition(claimId: string, outpoint: string, position: number) {
  return dispatch => {
    dispatch({
      type: ACTIONS.SET_CONTENT_POSITION,
      data: { claimId, outpoint, position },
    });
  };
}
