import { utils } from 'ethers';
import contracts from '../../contracts/contracts';
import { DAI, WETH } from '../../src/eth/Currency';
import { mineBlocks } from './transactionConfirmation';

export async function createDai(oasisExchangeService) {
  const cdp = await oasisExchangeService.get('cdp').openCdp();
  const tx = cdp.lockEth(1);
  mineBlocks(oasisExchangeService);
  await tx;
  return await cdp.drawDai(10);
}

export async function placeLimitOrder(oasisExchangeService, sellDai) {
  const wethToken = oasisExchangeService.get('token').getToken(WETH);
  const wethAddress = wethToken.address();
  const daiToken = oasisExchangeService.get('token').getToken(DAI);
  const daiAddress = daiToken.address();
  const oasisAddress = oasisExchangeService
    .get('smartContract')
    .getContractByName(contracts.MAKER_OTC).address;
  const sellToken = sellDai ? daiAddress : wethAddress;
  const buyToken = sellDai ? wethAddress : daiAddress;
  const value = sellDai ? utils.parseEther('2.0') : utils.parseEther('10.0');
  const position = sellDai ? 0 : 1;

  await wethToken.deposit('1');
  await wethToken.approveUnlimited(oasisAddress);
  await daiToken.approveUnlimited(oasisAddress);

  return offer(
    oasisExchangeService,
    utils.parseEther('0.5'),
    sellToken,
    value,
    buyToken,
    position
  );
}

async function offer(
  oasisExchangeService,
  payAmount,
  payTokenAddress,
  buyAmount,
  buyTokenAddress,
  position
) {
  const oasisContract = oasisExchangeService
    .get('smartContract')
    .getContractByName(contracts.MAKER_OTC);

  const tx = await oasisContract.offer(
    payAmount,
    payTokenAddress,
    buyAmount,
    buyTokenAddress,
    position
  );
  return await tx.mine();
}
