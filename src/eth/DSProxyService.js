import { PrivateService } from '@makerdao/services-core';
import { dappHub } from '../../contracts/abis';
import { Contract } from 'ethers';

export default class DSProxyService extends PrivateService {
  constructor(name = 'proxy') {
    super(name, ['web3']);
  }

  async authenticate() {
    this._currentProxy = await this.getProxyAddress();
  }

  setSmartContractService(service) {
    this._smartContractService = service;
  }

  _proxyRegistry() {
    return this._smartContractService.getContract('PROXY_REGISTRY');
  }

  _resetDefaults(newProxy) {
    this._currentProxy = newProxy;
    this._currentAddress = this.get('web3').currentAddress();
  }

  // this needs to be async so it can fetch the proxy address just-in-time after
  // an account switch. if we don't want this to be async, we have to make
  // maker.useAccount async and set up a hook so that this service can get the
  // new proxy address as soon as the switch happens
  async currentProxy() {
    return this._currentAddress === this.get('web3').currentAddress()
      ? this._currentProxy
      : this.getProxyAddress();
  }

  async ensureProxy() {
    let proxy = await this.currentProxy();
    if (!proxy) {
      this.get('web3')
        .get('event')
        .on('dsproxy/BUILD', obj => {
          proxy = obj.payload.address;
        });
      await this.build();
    }
    return proxy;
  }

  async build() {
    const proxy = await this.currentProxy();
    if (proxy) {
      throw new Error('This account already has a proxy deployed at ' + proxy);
    }
    const txo = await this._proxyRegistry().build();
    this._currentProxy = await this.getProxyAddress();
    this.get('web3')
      .get('event')
      .emit('dsproxy/BUILD', {
        address: this._currentProxy
      });
    return txo;
  }

  execute(contract, method, args, options, address) {
    if (!address && typeof this._currentProxy !== 'string') {
      throw new Error('No proxy found for current account');
    }
    const proxyAddress = address ? address : this._currentProxy;
    const proxyContract = this._getUnwrappedProxyContract(proxyAddress);
    const data = contract.interface.functions[method](...args).data;
    return proxyContract.execute(contract.address, data, options);
  }

  async getProxyAddress(providedAddress = false) {
    const address = providedAddress
      ? providedAddress
      : this.get('web3').currentAddress();

    let proxyAddress = await this._proxyRegistry().proxies(address);
    if (proxyAddress === '0x0000000000000000000000000000000000000000') {
      proxyAddress = null;
    }

    if (!providedAddress) this._resetDefaults(proxyAddress);
    return proxyAddress;
  }

  async getOwner(address) {
    const contract = this._getWrappedProxyContract(address);
    return contract.owner();
  }

  async setOwner(newOwner, proxyAddress = this._currentProxy) {
    const contract = this._getWrappedProxyContract(proxyAddress);
    return contract.setOwner(newOwner);
  }

  _getWrappedProxyContract(address) {
    return this._smartContractService.getContractByAddressAndAbi(
      address,
      dappHub.dsProxy
    );
  }

  _getUnwrappedProxyContract(address) {
    return new Contract(
      address,
      dappHub.dsProxy,
      this.get('web3').getEthersSigner()
    );
  }
}
