const asyncAuto = require('async/auto');
const isHex = require('is-hex');
const {returnResult} = require('asyncjs-util');

/** Verify a channel backup

  {
    backup: <Backup Hex String>
    lnd: <Authenticated LND gRPC API Object>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }

  @returns via cbk or Promise
  {
    [err]: <LND Error Object>
    is_valid: <Backup is Valid Bool>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.backup) {
          return cbk([400, 'ExpectedChannelBackupToVerify']);
        }

        if (!args.lnd || !args.lnd.default) {
          return cbk([400, 'ExpectedLndToVerifyChannelBackup']);
        }

        if (!args.transaction_id || !isHex(args.transaction_id)) {
          return cbk([400, 'ExpectedFundingTxIdOfChannelBackupToVerify']);
        }

        if (args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedFundingTxVoutOfChannelBackupToVerify']);
        }

        return cbk();
      },

      // Verify backup
      verify: ['validate', ({}, cbk) => {
        const transactionId = Buffer.from(args.transaction_id, 'hex');

        return args.lnd.default.verifyChanBackup({
          single_chan_backups: {
            chan_backups: [{
              chan_backup: Buffer.from(args.backup, 'hex'),
              chan_point: {
                funding_txid_bytes: transactionId.reverse(),
                output_index: args.transaction_vout,
              },
            }],
          },
        },
        err => {
          if (!!err) {
            return cbk(null, {err, is_valid: false});
          }

          return cbk(null, {is_valid: true});
        });
      }],
    },
    returnResult({reject, resolve, of: 'verify'}, cbk));
  });
};
