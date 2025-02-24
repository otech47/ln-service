const asyncAuto = require('async/auto');
const {chanNumber} = require('bolt07');
const {returnResult} = require('asyncjs-util');

const {channelEdgeAsChannel} = require('./../graph');

const edgeIsZombieErrorMessage = 'edge marked as zombie';
const edgeNotFoundErrorMessage = 'edge not found';

/** Get a channel

  {
    id: <Standard Format Channel Id String>
    lnd: <Authenticated LND gRPC API Object>
  }

  @returns via cbk or Promise
  {
    capacity: <Maximum Tokens Number>
    id: <Standard Format Channel Id String>
    policies: [{
      [base_fee_mtokens]: <Base Fee Millitokens String>
      [cltv_delta]: <Locktime Delta Number>
      [fee_rate]: <Fees Charged Per Million Tokens Number>
      [is_disabled]: <Channel Is Disabled Bool>
      [max_htlc_mtokens]: <Maximum HTLC Millitokens Value String>
      [min_htlc_mtokens]: <Minimum HTLC Millitokens Value String>
      public_key: <Node Public Key String>
    }]
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
    [updated_at]: <Channel Last Updated At ISO 8601 Date String>
  }
*/
module.exports = ({id, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!id) {
          return cbk([400, 'ExpectedChannelIdToGet']);
        }

        try {
          chanNumber({channel: id}).number
        } catch (err) {
          return cbk([400, 'ExpectedValidChannelIdToGetChannel', {err}]);
        }

        if (!lnd || !lnd.default || !lnd.default.getChanInfo) {
          return cbk([400, 'ExpectedLndToGetChannelDetails']);
        }

        return cbk();
      },

      // Get channel
      getChannel: ['validate', ({}, cbk) => {
        return lnd.default.getChanInfo({
          chan_id: chanNumber({channel: id}).number,
        },
        (err, response) => {
          if (!!err && err.details === edgeIsZombieErrorMessage) {
            return cbk([404, 'FullChannelDetailsNotFound']);
          }

          if (!!err && err.details === edgeNotFoundErrorMessage) {
            return cbk([404, 'FullChannelDetailsNotFound']);
          }

          if (!!err) {
            return cbk([503, 'UnexpectedGetChannelInfoError', err]);
          }

          if (!response) {
            return cbk([503, 'ExpectedGetChannelResponse']);
          }

          try {
            return cbk(null, channelEdgeAsChannel(response));
          } catch (err) {
            return cbk([503, err.message]);
          }
        });
      }],
    },
    returnResult({reject, resolve, of: 'getChannel'}, cbk));
  });
};
