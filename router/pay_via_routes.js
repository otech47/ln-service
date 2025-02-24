const asyncAuto = require('async/auto');
const isHex = require('is-hex');
const {returnResult} = require('asyncjs-util');

const subscribeToPayViaRoutes = require('./subscribe_to_pay_via_routes');

const {isArray} = Array;

/** Make a payment via a specified route

  Requires lnd built with routerrpc build tag

  If no id is specified, a random id will be used

  {
    [id]: <Payment Hash Hex String>
    lnd: <Authenticated LND gRPC API Object>
    [pathfinding_timeout]: <Time to Spend Finding a Route Milliseconds Number>
    routes: [{
      fee: <Total Fee Tokens To Pay Number>
      fee_mtokens: <Total Fee Millitokens To Pay String>
      hops: [{
        channel: <Standard Format Channel Id String>
        channel_capacity: <Channel Capacity Tokens Number>
        fee: <Fee Number>
        fee_mtokens: <Fee Millitokens String>
        forward: <Forward Tokens Number>
        forward_mtokens: <Forward Millitokens String>
        [public_key]: <Public Key Hex String>
        timeout: <Timeout Block Height Number>
      }]
      mtokens: <Total Millitokens To Pay String>
      timeout: <Expiration Block Height Number>
      tokens: <Total Tokens To Pay Number>
    }
  }

  @returns via cbk or Promise
  {
    failures: [[
      <Failure Code Number>
      <Failure Code Message String>
      <Failure Code Details Object>
    ]]
    fee: <Fee Paid Tokens Number>
    fee_mtokens: <Fee Paid Millitokens String>
    hops: [{
      channel: <Standard Format Channel Id String>
      channel_capacity: <Hop Channel Capacity Tokens Number>
      fee_mtokens: <Hop Forward Fee Millitokens String>
      forward_mtokens: <Hop Forwarded Millitokens String>
      timeout: <Hop CLTV Expiry Block Height Number>
    }]
    id: <Payment Hash Hex String>
    is_confirmed: <Is Confirmed Bool>
    is_outgoing: <Is Outoing Bool>
    mtokens: <Total Millitokens Sent String>
    secret: <Payment Secret Preimage Hex String>
    tokens: <Total Tokens Sent Number>
  }

  @returns error via cbk or Promise
  [
    <Error Classification Code Number>
    <Error Type String>
    {
      failures: [[
        <Failure Code Number>
        <Failure Code Message String>
        <Failure Code Details Object>
      ]]
    }
  ]
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!!args.id && !isHex(args.id)) {
          return cbk([400, 'ExpectedStandardHexPaymentHashId']);
        }

        if (!args.lnd || !args.lnd.router || !args.lnd.router.sendToRoute) {
          return cbk([400, 'ExpectedLndForToPayViaSpecifiedRoutes']);
        }

        if (!isArray(args.routes) || !args.routes.length) {
          return cbk([400, 'ExpectedArrayOfRoutesToPayViaRoutes']);
        }

        if (!!args.routes.find(n => n.hops.find(hop => !hop.public_key))) {
          return cbk([400, 'ExpectedPublicKeyInPayViaRouteHops']);
        }

        return cbk();
      },

      // Pay via routes
      payViaRoutes: ['validate', ({}, cbk) => {
        const result = {failures: []};

        const sub = subscribeToPayViaRoutes({
          id: args.id,
          lnd: args.lnd,
          pathfinding_timeout: args.pathfinding_timeout,
          routes: args.routes,
        });

        sub.on('success', success => result.success = success);

        sub.on('end', () => {
          if (!result.failures.length && !result.success) {
            return cbk([503, 'FailedToReceiveDiscreteFailureOrSuccess']);
          }

          if (!!result.success) {
            return cbk(null, {
              failures: result.failures,
              fee: result.success.fee,
              fee_mtokens: result.success.fee_mtokens,
              hops: result.success.hops.map(hop => ({
                channel: hop.channel,
                channel_capacity: hop.channel_capacity,
                fee: hop.fee,
                fee_mtokens: hop.fee_mtokens,
                forward: hop.forward,
                forward_mtokens: hop.forward_mtokens,
                timeout: hop.timeout,
              })),
              id: result.success.id,
              is_confirmed: true,
              is_outgoing: true,
              mtokens: result.success.mtokens,
              secret: result.success.secret,
              tokens: result.success.tokens,
            });
          }

          const {failures} = result;

          const [[lastFailCode, lastFailMessage]] = failures.slice().reverse();

          return cbk([lastFailCode, lastFailMessage, {failures}]);
        });

        sub.on('error', err => result.failures.push(err));
        sub.on('failure', ({failure}) => result.failures.push(failure));

        return;
      }],
    },
    returnResult({reject, resolve, of: 'payViaRoutes'}, cbk));
  });
};
