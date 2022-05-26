const Elections = artifacts.require("Elections");

module.exports = function(deployer) {
  deployer.deploy(Elections);
};