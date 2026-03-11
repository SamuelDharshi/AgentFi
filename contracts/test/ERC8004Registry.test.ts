import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ERC8004Registry } from "../typechain-types";

describe("ERC8004Registry", () => {
  let registry: ERC8004Registry;
  let deployer: SignerWithAddress;
  let marketAgent: SignerWithAddress;
  let user: SignerWithAddress;
  let stranger: SignerWithAddress;
  let atomicSwap: SignerWithAddress; // impersonates the AtomicSwap contract

  beforeEach(async () => {
    [deployer, marketAgent, user, stranger, atomicSwap] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ERC8004Registry");
    registry = (await Factory.deploy()) as ERC8004Registry;
    await registry.waitForDeployment();
  });

  // ── Identity Registry ────────────────────────────────────────────────────

  describe("registerAgent", () => {
    it("registers a new agent and emits AgentRegistered", async () => {
      await expect(
        registry
          .connect(deployer)
          .registerAgent(marketAgent.address, "MARKET_AGENT", "agentfi://market")
      )
        .to.emit(registry, "AgentRegistered")
        .withArgs(marketAgent.address, "MARKET_AGENT", "agentfi://market");

      const identity = await registry.getIdentity(marketAgent.address);
      expect(identity.active).to.be.true;
      expect(identity.agentType).to.equal("MARKET_AGENT");
      expect(identity.owner).to.equal(deployer.address);
    });

    it("reverts if the same agent is registered twice", async () => {
      await registry
        .connect(deployer)
        .registerAgent(marketAgent.address, "MARKET_AGENT", "uri://1");

      await expect(
        registry
          .connect(deployer)
          .registerAgent(marketAgent.address, "MARKET_AGENT", "uri://2")
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    });

    it("allows different agents to be registered by different owners", async () => {
      await registry
        .connect(deployer)
        .registerAgent(marketAgent.address, "MARKET_AGENT", "uri://agent");
      await registry
        .connect(stranger)
        .registerAgent(user.address, "USER_AGENT", "uri://user");

      const agentId = await registry.getIdentity(marketAgent.address);
      const userId = await registry.getIdentity(user.address);
      expect(agentId.active).to.be.true;
      expect(userId.active).to.be.true;
    });
  });

  describe("deregisterAgent", () => {
    beforeEach(async () => {
      await registry
        .connect(deployer)
        .registerAgent(marketAgent.address, "MARKET_AGENT", "uri://agent");
    });

    it("deregisters an agent and emits AgentDeregistered", async () => {
      await expect(registry.connect(deployer).deregisterAgent(marketAgent.address))
        .to.emit(registry, "AgentDeregistered")
        .withArgs(marketAgent.address);

      const identity = await registry.getIdentity(marketAgent.address);
      expect(identity.active).to.be.false;
    });

    it("reverts if a non-owner tries to deregister", async () => {
      await expect(
        registry.connect(stranger).deregisterAgent(marketAgent.address)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });

    it("reverts if agent is not registered", async () => {
      await expect(
        registry.connect(deployer).deregisterAgent(stranger.address)
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });

  describe("getRegisteredAgents", () => {
    it("returns only active agents", async () => {
      await registry
        .connect(deployer)
        .registerAgent(marketAgent.address, "MARKET_AGENT", "uri://1");
      await registry
        .connect(deployer)
        .registerAgent(user.address, "USER_AGENT", "uri://2");
      await registry.connect(deployer).deregisterAgent(user.address);

      const active = await registry.getRegisteredAgents();
      expect(active).to.deep.equal([marketAgent.address]);
    });
  });

  // ── Reputation Registry ──────────────────────────────────────────────────

  describe("setAtomicSwapContract", () => {
    it("only deployer can set the AtomicSwap address", async () => {
      await registry
        .connect(deployer)
        .setAtomicSwapContract(atomicSwap.address);
      expect(await registry.atomicSwapContract()).to.equal(atomicSwap.address);
    });

    it("reverts if called by non-deployer", async () => {
      await expect(
        registry.connect(stranger).setAtomicSwapContract(atomicSwap.address)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });
  });

  describe("incrementReputation", () => {
    const tradeRef = ethers.keccak256(ethers.toUtf8Bytes("trade-001"));

    beforeEach(async () => {
      await registry
        .connect(deployer)
        .registerAgent(marketAgent.address, "MARKET_AGENT", "uri://agent");
      await registry
        .connect(deployer)
        .setAtomicSwapContract(atomicSwap.address);
    });

    it("increments score and emits ReputationIncremented", async () => {
      await expect(
        registry
          .connect(atomicSwap)
          .incrementReputation(marketAgent.address, 1, tradeRef)
      )
        .to.emit(registry, "ReputationIncremented")
        .withArgs(marketAgent.address, 1, 1, tradeRef);

      const rep = await registry.getReputation(marketAgent.address);
      expect(rep.score).to.equal(1);
      expect(rep.tradeCount).to.equal(1);
    });

    it("accumulates score across multiple trades", async () => {
      const ref2 = ethers.keccak256(ethers.toUtf8Bytes("trade-002"));
      await registry
        .connect(atomicSwap)
        .incrementReputation(marketAgent.address, 1, tradeRef);
      await registry
        .connect(atomicSwap)
        .incrementReputation(marketAgent.address, 1, ref2);

      const rep = await registry.getReputation(marketAgent.address);
      expect(rep.score).to.equal(2);
      expect(rep.tradeCount).to.equal(2);
    });

    it("reverts if caller is not the AtomicSwap contract", async () => {
      await expect(
        registry
          .connect(stranger)
          .incrementReputation(marketAgent.address, 1, tradeRef)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });

    it("reverts if agent is not registered", async () => {
      await expect(
        registry
          .connect(atomicSwap)
          .incrementReputation(stranger.address, 1, tradeRef)
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });
});
