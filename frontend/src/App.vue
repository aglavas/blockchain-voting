<template>
  <div id="app">
    <div class="container">
      <h1 class="text-center">Voting</h1>
      <div v-if="isAdminConnected"> 
        <div class="row">
          <div class="col-sm-12">
            <h2>Create ballot</h2>
            <form @submit="createBallot">
              <div class="form-group">
                <label for="name">Name</label>
                <input v-model="createBallotObject.name" type="text" class="form-control" id="name" />
              </div>
              <div class="form-group">
                <label for="choices">Choices</label>
                <input v-model="createBallotObject.choices" type="text" class="form-control" id="choices" />
              </div>
              <div class="form-group">
                <label for="duration">Duration (s)</label>
                <input v-model="createBallotObject.duration" type="text" class="form-control" id="duration" />
              </div>
              <br>
              <p class="h1">{{createBallotObject.result}}</p>
              <ValidationErrors :errors="createBallotObject.errors"></ValidationErrors>
              <button class="btn btn-primary">Submit</button>
            </form>
          </div>
        </div>
        <hr/>
        <div class="row">
          <div class="col-sm-12">
            <h2>Add voters</h2>
            <form @submit="addVoters">
              <div class="form-group">
                <label for="voters">Voters</label>
                <input v-model="addVotersObject.voters" type="text" class="form-control" id="voters" />
              </div>
              <br>
              <p class="h1">{{addVotersObject.result}}</p>
              <ValidationErrors :errors="addVotersObject.errors"></ValidationErrors>
              <button class="btn btn-primary">Submit</button>
            </form>
          </div>
        </div>
        <hr/>
      </div>
      <div v-else>
        <div class="row">
          <div class="col-sm-12">
            <h2>Votes</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Name</th>
                  <th>Votes</th>
                  <th>Vote</th>
                  <th>Ends on</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(ballot, index) in ballots" :key="index">
                  <td>{{ ballot.id }}</td>
                  <td>{{ ballot.name }}</td>
                  <td>
                    <ul>
                      <li v-for="(choice, choiceIndex) in ballot.choices" :key="choiceIndex">
                        Id: {{ choice.id }}, 
                        Name: {{ choice.name }}, 
                        Votes: {{ choice.votes }}
                      </li>
                    </ul>
                  </td>
                  <td>
                    <div v-if="isFinished(ballot)">
                      <p class="h1">Vote finished</p>
                    </div>
                    <div v-else-if="ballot.hasVoted">
                      <p class="h1">You already voted</p>
                    </div>
                    <div v-else>
                      <form @submit="vote($event, ballot.id)">
                        <div class="form-group">
                          <input type="hidden" name="ballotId" :value="ballot.id" /> 
                          <label for="choice">Choice</label>
                          <select class="form-control" id="choice" @change="selectChoice">
                            <option :selected="true">Choose</option>
                            <option v-for="(choice, choiceIndex) in ballot.choices" :key="choiceIndex" v-bind:value="choice.id">{{ choice.name }}</option>
                          </select>
                        </div>
                        <br>
                        <button class="btn btn-primary">Submit</button>
                      </form>
                    </div>
                  </td>
                  <td>
                    {{( new Date(parseInt(ballot.end) * 1000)).toLocaleString() }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>      
    </div>
  </div>
</template>

<script>

import Elections from '../../build/contracts/Elections.json';
import { getWeb3 } from './utils.js';
import ValidationErrors from './components/ValidationErrors.vue';

export default {
  name: 'App',
  components: {
    ValidationErrors
  },
  data() {
    return {
      web3: '',
      accounts: '',
      contract: '',
      admin: '',
      createBallotObject: {
        name: null,
        choices: null,
        duration: null,
        errors: [],
        result: null
      },
      addVotersObject: {
        voters: null,
        errors: [],
        result: ''
      },
      choice: '',
      ready: false,
      ballots: []
    }
  },
  async mounted() {
    this.web3 = await getWeb3();
    this.accounts = await this.web3.eth.getAccounts();
    let networkId = await this.web3.eth.net.getId();
    let deployedNetwork = Elections.networks[networkId];
    this.contract = new this.web3.eth.Contract(
        Elections.abi,
        deployedNetwork && deployedNetwork.address,
      );
    this.admin =  await this.contract.methods.adminAddress().call();
    await this.updateBallots();
    this.ready = true;
  },
  methods: {
    selectChoice: function (e) {
      this.choice = e.target.value;
    },
    vote: async function (e, ballotId) {
      e.preventDefault();
      
      if (!this.choice) {
        return false;
      }

      let votePromise = this.contract.methods.vote(ballotId, this.choice).send({from: this.accounts[0]});

      votePromise.then(() => {
        this.updateBallots();
      }).catch((error) => {
        let messageString = error.message;
        let indexOf = messageString.indexOf('{')
        let messageJson = JSON.parse(
          messageString.slice(indexOf, messageString.length - 1)
        );
        this.addVotersObject.result = messageJson.value.data.message;
      });
    },
    updateBallots: async function () {
      const nextBallotId = parseInt(await this.contract.methods.nextBallot().call());
      const ballots = [];
      for(let i = 0; i < nextBallotId; i++) { 
        let [ballot, hasVoted] = await Promise.all([
          this.contract.methods.getBallotData(i).call(),
          this.contract.methods.votes(this.accounts[0], i).call() 
        ]);

        let choices = ballot[0].choices;
        let choicesFormatted = [];
        choices.forEach(element => {
          choicesFormatted.push({
            id: element.id,
            name: element.name,
            voteCount: element.voteCount,
          })
        }, choicesFormatted);

        ballots.push({
          id: ballot[0].id,
          name: ballot[0].name,
          end: ballot[0].end,
          choices: choicesFormatted,
          hasVoted: hasVoted
        });
      }

      this.ballots = ballots;
    },
    addVoters: async function (e) {
      e.preventDefault();

      let error = false;
      this.addVotersObject.errors = [];

      if (!this.addVotersObject.voters) {
        this.addVotersObject.errors.push('Addresses of voters are required.');
        error = true;
      }

      if (error) {
        return false;
      }

      let addVotersPromise = this.contract.methods.addVoters(this.votersArray).send({from: this.admin});

      addVotersPromise.then(() => {
        this.addVotersObject.result = `Voters have been added.`;
        this.addVotersObject.voters = '';
        this.updateBallots();
      }).catch((error) => {
        let messageString = error.message;
        let indexOf = messageString.indexOf('{')
        let messageJson = JSON.parse(
          messageString.slice(indexOf, messageString.length - 1)
        );
        this.addVotersObject.result = messageJson.value.data.message;
      });
    },
    createBallot: async function (e) {
      e.preventDefault();

      let error = false;
      this.createBallotObject.errors = [];

      if (!this.createBallotObject.name) {
        this.createBallotObject.errors.push('Name is required.');
        error = true;
      }

      if (!this.createBallotObject.choices) {
        this.createBallotObject.errors.push('Choices are required.');
        error = true;
      }

      if (!this.createBallotObject.duration) {
        this.createBallotObject.errors.push('Duration is required.');
        error = true;
      }

      if (error) {
        return false;
      }

      let createBallotPromise = this.contract.methods.createBallot(this.createBallotObject.name, this.choicesArray, this.createBallotObject.duration).send({from: this.admin});

      createBallotPromise.then(() => {
        this.createBallotObject.result = `Ballot has been created`;
        this.createBallotObject.name = '';
        this.createBallotObject.choices = '';
        this.createBallotObject.duration = '';
        this.updateBallots();        
      }).catch((error) => {
        let messageString = error.message;
        let indexOf = messageString.indexOf('{')
        let messageJson = JSON.parse(
          messageString.slice(indexOf, messageString.length - 1)
        );
        this.createBallotObject.result = messageJson.value.data.message;
      });
    },
    isFinished: function (ballot) {
      const now = (new Date()).getTime();
      const ballotEnd =  (new Date(parseInt(ballot.end) * 1000)).getTime();
      return (ballotEnd - now) > 0 ? false : true;
    }
  },
  computed: {
      isAdminConnected() {
        if (this.accounts[0] == this.admin) {
          return true;
        }

        return false;
      },
      choicesArray() {
        if (this.createBallotObject.choices) {
          return this.createBallotObject.choices.split(',');
        }
        
        return null;
      },
      votersArray() {
        if (this.addVotersObject.voters) {
          return this.addVotersObject.voters.split(',');
        }
        
        return null;
      }
    },
}
</script>