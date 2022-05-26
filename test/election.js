const { expectRevert, time } = require('@openzeppelin/test-helpers');
const Elections = artifacts.require('Elections');

contract('Elections', (accounts) => {
  let elections = null;
  const admin = accounts[0];
  const voter1 = accounts[1];
  const voter2 = accounts[2];
  const voter3 = accounts[3];
  const nonVoter = accounts[4];
  before(async () => {
     elections = await Elections.deployed();
  });

  it('should register voters', async () => {
    await elections.addVoters([voter1, voter2, voter3]);
    const results = await Promise.all(
      [voter1, voter2, voter3].map(voter =>
        elections.voters(voter)
      )
    );
    results.forEach(result => assert(result === true));
  });

  it('should create ballot', async () => {
    await elections.createBallot(
      'County Elections Ballot 1',
      ['Conservative', 'Liberal', 'Social Democrat'],
      5,
      {from: admin}
    );
    const ballot = await elections.ballots(0);
    assert(ballot.name === 'County Elections Ballot 1');
  });

  it('should NOT create ballot if not admin', async () => {
    await expectRevert(elections.createBallot('Ballot', ['Choice 1', 'Choice 2'], 5, {from: voter1}), 'only admin action');
  });

  it('should NOT add voters if not admin', async () => {
    await expectRevert(elections.addVoters([voter1, voter2, voter3], {from: voter1}), 'only admin action');
  });

  it('should NOT vote if not a voter', async () => {
    await elections.createBallot('Ballot', ['Choice 1', 'Choice 2', 'Choice 3'], 5, {from: admin});
    await expectRevert(elections.vote(1, 0, {from: nonVoter}), 'address is not on voter list');
  });

  it('should NOT vote after ballot end', async () => {
    await elections.createBallot('Ballot XX', ['Choice 1', 'Choice 2', 'Choice 3'], 5, {from: admin});
    await time.increase(5001);
    await expectRevert(elections.vote(0, 0, {from: voter3}), 'ballot voting has already ended');
  });

  it('should vote', async () => {
    await elections.createBallot('Ballot Final', ['Choice 1', 'Choice 2', 'Choice 3'], 5, {from: admin});
    await elections.vote(3, 0, {from: voter1}),
    await elections.vote(3, 0, {from: voter2}),
    await elections.vote(3, 1, {from: voter3}),
    await time.increase(5001);
    const results = await elections.result(3); 
    assert(results[0].voteCount === '2');
    assert(results[1].voteCount === '1');
    assert(results[2].voteCount === '0');
    await expectRevert(elections.vote(3, 0, {from: voter1}), 'voter can vote only once');
  });
});