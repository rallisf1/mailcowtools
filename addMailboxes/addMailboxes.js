// Written by Markus Schicker, markus@appcoders.de
// MIT License

// Copyright (c) 2020 Markus Schicker

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const { program } = require('commander');
const axios = require('axios');
const process = require('process');
const csvtojsonV2 = require("csvtojson/v2");
const version = require('./package').version;


let axiosInstance = null;

const configureAxios = () => {
  const instance = axios.create({
    baseURL: program.serverurl,
    headers: { 'X-API-Key': program.apikey, 'Content-Type': 'application/json' }
  });
  return instance;
}

let existingDomains = [];

const plans = {
	'default': {
		'aliases': 400,
		'mailboxes': 10,
		'defquota': 3072,
		'maxquota': 10240,
		'quota': 10240,
		'active': true
	},
	'basic': {
		'aliases': 400,
		'mailboxes': 10,
		'defquota': 1024,
		'maxquota': 10240,
		'quota': 10240,
		'active': true,
		'rl_frame': "h",
		'rl_value': 500
	},
	'business': {
		'aliases': 400,
		'mailboxes': 25,
		'defquota': 1024,
		'maxquota': 10240,
		'quota': 25600,
		'active': true,
		'rl_frame': "h",
		'rl_value': 1500
	},
	'professional': {
		'aliases': 400,
		'mailboxes': 50,
		'defquota': 3072,
		'maxquota': 10240,
		'quota': 51200,
		'active': true,
		'rl_frame': "h",
		'rl_value': 5000
	},
	'enterprise': {
		'aliases': 4000,
		'mailboxes': 1000,
		'defquota': 3072,
		'maxquota': 10240,
		'quota': 256000,
		'active': true
	}
};

const importFile = async (filename) => {
  let importJSON = null;

  try {
    importJSON = await csvtojsonV2({
      noheader: true,
      headers: ['email', 'name', 'password', 'quota', 'plan']
    }).fromFile(filename);
  } catch (error) {
    console.error(`Error while import:\n${error}`);
    process.exit(-1);
  }
  return importJSON.map(element => {
    const emailParts = element.email.split('@');
    delete element.email;
    return { ...element, local_part: emailParts[0], domain: emailParts[1], active: "1", password: element.password , password2: element.password , tls_enforce_in: "1" , tls_enforce_out: "1" }
  });
}

const addMailbox = async (mailboxInfo) => {
  try {
    const result = await axiosInstance.post('/api/v1/add/mailbox', mailboxInfo);
    if (result.status !== 200) {
      console.error(`Error while creating mailbox ${mailboxInfo.local_part}@${mailboxInfo.domain}.`);
      if (program.exitonerror) {
        process.exit(3);
      }
    }
    console.log(`Created mailbox ${mailboxInfo.local_part}@${mailboxInfo.domain} with quota ${mailboxInfo.quota} MB`);
  } catch (error) {
    console.error(`Error while adding Mailbox ${mailboxInfo.local_part}@${mailboxInfo.domain}:\n${error}`);
    process.exit(2);
  }
}

const checkDomain = async (mailboxInfo) => {
  if(existingDomains.includes(mailboxInfo.domain)) return true;
  try {
    const result = await axiosInstance.get(`/api/v1/get/domain/${mailboxInfo.domain}`);
    if (result.status !== 200) {
      console.error(`Error while checking domain ${mailboxInfo.domain}.`);
      if (program.exitonerror) {
        process.exit(3);
      }
    }
    if(result.data.hasOwnProperty('gal')) {
		existingDomains.push(mailboxInfo.domain);
		return true;
	}
	return false;
  } catch (error) {
    console.error(`Error while checking domain ${mailboxInfo.domain}:\n${error}`);
    process.exit(2);
  }
}

const addDomain = async (mailboxInfo) => {
  try {
    const result = await axiosInstance.post('/api/v1/add/domain', {
		domain: mailboxInfo.domain,
		gal: "1",
		...plans[mailboxInfo.plan]
	});
    if (result.status !== 200) {
      console.error(`Error while creating domain ${mailboxInfo.domain}.`);
      if (program.exitonerror) {
        process.exit(3);
      }
    }
    console.log(`Created domain ${mailboxInfo.domain} with plan ${mailboxInfo.plan}`);
  } catch (error) {
    console.error(`Error while adding domain ${mailboxInfo.domain}:\n${error}`);
    process.exit(2);
  }
}

const addMailboxes = async (mailboxInfos) => {
  console.log(`Beginning import of ${mailboxInfos.length} mailboxes`);
  mailboxInfos.map(async (mailboxInfo) => {
	let domainExists = await checkDomain(mailboxInfo);
	if(!domainExists) await addDomain(mailboxInfo);
    await addMailbox(mailboxInfo);
  })
}

const main = async () => {
  program.version(version);
  
  program
    .requiredOption('-i, --importfile <importfile>', 'Path to import file CSV')
    .requiredOption('-s, --serverurl <serverurl>', 'URL of mailcow server : https://mailcow.example.org')
    .requiredOption('-a, --apikey <apikey>', 'APIKEY for mailcow API')
    .option('-e, --exitonerror', 'exit on first error');

  program.parse(process.argv);
  axiosInstance = configureAxios();

  const mailboxInfos = await importFile(program.importfile);
  await addMailboxes(mailboxInfos);
}

main();


