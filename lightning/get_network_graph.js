const asyncAuto = require('async/auto');
const {chanFormat} = require('bolt07');
const {returnResult} = require('asyncjs-util');

const countGroupingFactor = 3;
const decBase = 10;
const {isArray} = Array;
const msPerSec = 1e3
const outpointSeparatorChar = ':';

/** Get network graph

  {
    lnd: <Authenticated LND gRPC API Object>
  }

  @returns via cbk or Promise
  {
    channels: [{
      capacity: <Channel Capacity Tokens Number>
      id: <Standard Format Channel Id String>
      policies: [{
        [base_fee_mtokens]: <Bae Fee Millitokens String>
        [cltv_delta]: <CLTV Height Delta Number>
        [fee_rate]: <Fee Rate In Millitokens Per Million Number>
        [is_disabled]: <Edge is Disabled Bool>
        [max_htlc_mtokens]: <Maximum HTLC Millitokens String>
        [min_htlc_mtokens]: <Minimum HTLC Millitokens String>
        public_key: <Public Key String>
      }]
      transaction_id: <Funding Transaction Id String>
      transaction_vout: <Funding Transaction Output Index Number>
      updated_at: <Last Update Epoch ISO 8601 Date String>
    }]
    nodes: [{
      alias: <Name String>
      color: <Hex Encoded Color String>
      public_key: <Node Public Key String>
      sockets: [<Network Address and Port String>]
      updated_at: <Last Updated ISO 8601 Date String>
    }]
  }
*/
module.exports = ({lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!lnd || !lnd.default || !lnd.default.describeGraph) {
          return cbk([400, 'ExpectedLndForGetNetworkGraphRequest']);
        }

        return cbk();
      },

      // Get network graph
      getGraph: ['validate', ({}, cbk) => {
        return lnd.default.describeGraph({}, (err, networkGraph) => {
          if (!!err) {
            return cbk([503, 'GetNetworkGraphError', {err}]);
          }

          if (!networkGraph) {
            return cbk([503, 'ExpectedNetworkGraph']);
          }

          if (!isArray(networkGraph.edges)) {
            return cbk([503, 'ExpectedNetworkGraphEdges']);
          }

          if (!isArray(networkGraph.nodes)) {
            return cbk([503, 'ExpectedNetworkGraphNodes']);
          }

          return cbk(null, networkGraph);
        });
      }],

      // Network graph
      graph: ['getGraph', ({getGraph}, cbk) => {
        const hasChannel = {};

        try {
          getGraph.edges.map(n => chanFormat({number: n.channel_id}));
        } catch (err) {
          return cbk([503, 'ExpectedValidNumericChannelId', err]);
        }

        const channels = getGraph.edges.map(n => {
          const [txId, vout] = n.chan_point.split(outpointSeparatorChar);

          const policies = [n.node1_policy, n.node2_policy].map(policy => {
            if (!policy) {
              return {};
            }

            return {
              base_fee_mtokens: policy.fee_base_msat,
              cltv_delta: policy.time_lock_delta,
              fee_rate: parseInt(policy.fee_rate_milli_msat, decBase),
              is_disabled: !!policy.disabled,
              max_htlc_mtokens: policy.max_htlc_msat,
              min_htlc_mtokens: policy.min_htlc,
            };
          });

          const [node1Policy, node2Policy] = policies;

          hasChannel[n.node1_pub] = true;
          hasChannel[n.node2_pub] = true;

          node1Policy.public_key = n.node1_pub;
          node2Policy.public_key = n.node2_pub;

          return {
            policies,
            capacity: parseInt(n.capacity, decBase),
            id: chanFormat({number: n.channel_id}).channel,
            transaction_id: txId,
            transaction_vout: parseInt(vout, decBase),
            updated_at: new Date(n.last_update * msPerSec).toISOString(),
          };
        });

        const nodes = getGraph.nodes.filter(n => !!n.last_update).map(n => {
          return {
            alias: n.alias,
            color: n.color,
            public_key: n.pub_key,
            sockets: n.addresses.map(({addr}) => addr),
            updated_at: new Date(n.last_update * msPerSec).toISOString(),
          };
        });

        return cbk(null, {
          channels,
          nodes: nodes.filter(n => !!hasChannel[n.public_key]),
        });
      }],
    },
    returnResult({reject, resolve, of: 'graph'}, cbk));
  });
};
