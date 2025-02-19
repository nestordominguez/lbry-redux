// @flow
import 'proxy-polyfill';

const CHECK_DAEMON_STARTED_TRY_NUMBER = 200;
//
// Basic LBRY sdk connection config
// Offers a proxy to call LBRY sdk methods

//
const Lbry: LbryTypes = {
  isConnected: false,
  connectPromise: null,
  daemonConnectionString: 'http://localhost:5279',
  apiRequestHeaders: { 'Content-Type': 'application/json-rpc' },

  // Allow overriding daemon connection string (e.g. to `/api/proxy` for lbryweb)
  setDaemonConnectionString: (value: string) => {
    Lbry.daemonConnectionString = value;
  },

  setApiHeader: (key: string, value: string) => {
    Lbry.apiRequestHeaders = Object.assign(Lbry.apiRequestHeaders, { [key]: value });
  },

  unsetApiHeader: key => {
    Object.keys(Lbry.apiRequestHeaders).includes(key) && delete Lbry.apiRequestHeaders['key'];
  },
  // Allow overriding Lbry methods
  overrides: {},
  setOverride: (methodName, newMethod) => {
    Lbry.overrides[methodName] = newMethod;
  },

  // Returns a human readable media type based on the content type or extension of a file that is returned by the sdk
  getMediaType: (contentType: string, extname: ?string) => {
    if (extname) {
      const formats = [
        [/^(mp4|m4v|webm|flv|f4v|ogv)$/i, 'video'],
        [/^(mp3|m4a|aac|wav|flac|ogg|opus)$/i, 'audio'],
        [/^(html|htm|xml|pdf|odf|doc|docx|md|markdown|txt|epub|org)$/i, 'document'],
        [/^(stl|obj|fbx|gcode)$/i, '3D-file'],
      ];
      const res = formats.reduce((ret, testpair) => {
        switch (testpair[0].test(ret)) {
          case true:
            return testpair[1];
          default:
            return ret;
        }
      }, extname);
      return res === extname ? 'unknown' : res;
    } else if (contentType) {
      // $FlowFixMe
      return /^[^/]+/.exec(contentType)[0];
    }
    return 'unknown';
  },

  //
  // Lbry SDK Methods
  // https://lbry.tech/api/sdk
  //
  status: (params = {}) => daemonCallWithResult('status', params),
  stop: () => daemonCallWithResult('stop', {}),
  version: () => daemonCallWithResult('version', {}),

  // Claim fetching and manipulation
  resolve: params => daemonCallWithResult('resolve', params),
  get: params => daemonCallWithResult('get', params),
  publish: params => daemonCallWithResult('publish', params),
  claim_search: params => daemonCallWithResult('claim_search', params),
  claim_list: params => daemonCallWithResult('claim_list', params),
  channel_create: params => daemonCallWithResult('channel_create', params),
  channel_update: params => daemonCallWithResult('channel_update', params),
  channel_list: params => daemonCallWithResult('channel_list', params),
  stream_abandon: params => daemonCallWithResult('stream_abandon', params),
  channel_abandon: params => daemonCallWithResult('channel_abandon', params),
  support_create: params => daemonCallWithResult('support_create', params),

  // File fetching and manipulation
  file_list: (params = {}) => daemonCallWithResult('file_list', params),
  file_delete: (params = {}) => daemonCallWithResult('file_delete', params),
  file_set_status: (params = {}) => daemonCallWithResult('file_set_status', params),
  blob_delete: (params = {}) => daemonCallWithResult('blob_delete', params),
  blob_list: (params = {}) => daemonCallWithResult('blob_list', params),

  // Wallet utilities
  account_balance: (params = {}) => daemonCallWithResult('account_balance', params),
  account_decrypt: () => daemonCallWithResult('account_decrypt', {}),
  account_encrypt: (params = {}) => daemonCallWithResult('account_encrypt', params),
  account_unlock: (params = {}) => daemonCallWithResult('account_unlock', params),
  account_list: (params = {}) => daemonCallWithResult('account_list', params),
  account_send: (params = {}) => daemonCallWithResult('account_send', params),
  account_set: (params = {}) => daemonCallWithResult('account_set', params),
  address_is_mine: (params = {}) => daemonCallWithResult('address_is_mine', params),
  address_unused: (params = {}) => daemonCallWithResult('address_unused', params),
  transaction_list: (params = {}) => daemonCallWithResult('transaction_list', params),
  utxo_release: (params = {}) => daemonCallWithResult('utxo_release', params),
  support_abandon: (params = {}) => daemonCallWithResult('support_abandon', params),

  sync_hash: (params = {}) => daemonCallWithResult('sync_hash', params),
  sync_apply: (params = {}) => daemonCallWithResult('sync_apply', params),

  // Comments
  comment_list: (params = {}) => daemonCallWithResult('comment_list', params),
  comment_create: (params = {}) => daemonCallWithResult('comment_create', params),
  // Connect to the sdk
  connect: () => {
    if (Lbry.connectPromise === null) {
      Lbry.connectPromise = new Promise((resolve, reject) => {
        let tryNum = 0;
        // Check every half second to see if the daemon is accepting connections
        function checkDaemonStarted() {
          tryNum += 1;
          Lbry.status()
            .then(resolve)
            .catch(() => {
              if (tryNum <= CHECK_DAEMON_STARTED_TRY_NUMBER) {
                setTimeout(checkDaemonStarted, tryNum < 50 ? 400 : 1000);
              } else {
                reject(new Error('Unable to connect to LBRY'));
              }
            });
        }

        checkDaemonStarted();
      });
    }

    // Flow thinks this could be empty, but it will always reuturn a promise
    // $FlowFixMe
    return Lbry.connectPromise;
  },
};

function checkAndParse(response) {
  if (response.status >= 200 && response.status < 300) {
    return response.json();
  }
  return response.json().then(json => {
    let error;
    if (json.error) {
      const errorMessage = typeof json.error === 'object' ? json.error.message : json.error;
      error = new Error(errorMessage);
    } else {
      error = new Error('Protocol error with unknown response signature');
    }
    return Promise.reject(error);
  });
}

function apiCall(method: string, params: ?{}, resolve: Function, reject: Function) {
  const counter = new Date().getTime();
  const options = {
    method: 'POST',
    headers: Lbry.apiRequestHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: counter,
    }),
  };

  return fetch(Lbry.daemonConnectionString, options)
    .then(checkAndParse)
    .then(response => {
      const error = response.error || (response.result && response.result.error);

      if (error) {
        return reject(error);
      }
      return resolve(response.result);
    })
    .catch(reject);
}

function daemonCallWithResult(name: string, params: ?{} = {}) {
  return new Promise((resolve, reject) => {
    apiCall(
      name,
      params,
      result => {
        resolve(result);
      },
      reject
    );
  });
}

// This is only for a fallback
// If there is a Lbry method that is being called by an app, it should be added to /flow-typed/Lbry.js
const lbryProxy = new Proxy(Lbry, {
  get(target: LbryTypes, name: string) {
    if (name in target) {
      return target[name];
    }

    return (params = {}) =>
      new Promise((resolve, reject) => {
        apiCall(name, params, resolve, reject);
      });
  },
});

export default lbryProxy;
