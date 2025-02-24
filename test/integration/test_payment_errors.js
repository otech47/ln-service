const {decodeChanId} = require('bolt07');
const {test} = require('tap');

const {createCluster} = require('./../macros');
const {createInvoice} = require('./../../');
const {delay} = require('./../macros');
const {getChannel} = require('./../../');
const {getChannels} = require('./../../');
const {getPendingChannels} = require('./../../');
const {getWalletInfo} = require('./../../');
const {hopsFromChannels} = require('./../../routing');
const {openChannel} = require('./../../');
const {pay} = require('./../../');
const {routeFromHops} = require('./../../routing');
const {waitForChannel} = require('./../macros');

const channelCapacityTokens = 1e6;
const confirmationCount = 20;
const defaultFee = 1e3;
const mtok = '000';
const tokens = 1e3;

// Encountering errors in payment should return valid error codes
test('Payment errors', async ({end, equal}) => {
  const cluster = await createCluster({});

  const {lnd} = cluster.control;

  // Create a channel from the control to the target node
  const controlToTargetChannel = await openChannel({
    lnd,
    chain_fee_tokens_per_vbyte: defaultFee,
    local_tokens: channelCapacityTokens,
    partner_public_key: cluster.target_node_public_key,
    socket: `${cluster.target.listen_ip}:${cluster.target.listen_port}`,
  });

  // Generate to confirm the channel
  await cluster.generate({count: confirmationCount, node: cluster.control});

  // Create a channel from the target back to the control
  const targetToControlChannel = await openChannel({
    chain_fee_tokens_per_vbyte: defaultFee,
    lnd: cluster.target.lnd,
    local_tokens: channelCapacityTokens,
    partner_public_key: (await getWalletInfo({lnd})).public_key,
    socket: `${cluster.control.listen_ip}:${cluster.control.listen_port}`,
  });

  // Generate to confirm the channel
  await cluster.generate({count: confirmationCount, node: cluster.target});

  await waitForChannel({
    id: targetToControlChannel.transaction_id,
    lnd: cluster.target.lnd,
  });

  const height = (await getWalletInfo({lnd})).current_block_height;
  const invoice = await createInvoice({lnd, tokens});
  const mtokens = `${tokens}${mtok}`;

  await delay(1000);

  const {channels} = await getChannels({lnd});
  const {id} = invoice;

  const [inChanId, outChanId] = channels.map(({id}) => id).sort();

  const destination = (await getWalletInfo({lnd})).public_key;

  try {
    const inChan = await getChannel({lnd, id: inChanId});
    const outChan = await getChannel({lnd, id: outChanId});

    inChan.id = inChanId;
    outChan.id = outChanId;

    const {hops} = hopsFromChannels({destination, channels: [inChan, outChan]});

    const route = routeFromHops({height, hops, mtokens});

    route.hops[0].fee = 0;
    route.hops[0].fee_mtokens = '0';
    route.fee = 0;
    route.fee_mtokens = '0';
    route.mtokens = '1000000';
    route.tokens = 1000;

    await pay({lnd, path: {id, routes: [route]}});
  } catch (err) {
    const [, code, context] = err;

    equal(code, 'RejectedUnacceptableFee', 'Pay fails due to low fee');
    equal(context.channel, channels.find(n => !n.local_balance).id);
  }

  await cluster.kill({});

  return end();
});
