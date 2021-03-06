'use strict';

const {
  dialogflow,
  BasicCard,
  SimpleResponse,
  Suggestions,
  Button,
  SignIn,
  UpdatePermission
} = require('actions-on-google');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const auth = admin.auth();
const app = dialogflow({ clientId: "476966118705-3837ik497lglscvrqqs14r72s6t2gi8m.apps.googleusercontent.com", debug: true });
const db = admin.firestore();
const {
  DateTime
} = require('luxon');
const _ = require('lodash');
const cors = require('cors')({
  origin: true,
});
const intentSuggestions = [
  'Grocery',
  'Food',
  'Transport',
  'Mobile',
  'Internet',
  'Clothes',
  'Education',
  'Last Month Expense'
];

const filterSuggestions = intentSuggestions.filter((intent) =>{
  return intent!=="Mobile" && intent!=="Internet"
})

const pushNotificationSuggesion = [
  'Notify Me Every Week'
];

app.intent('Default Welcome Intent', (conv) => {
  conv.ask(new SimpleResponse({
    speech: 'Welcome To BotEveryWhere Expense Assistant!',
    text: 'Welcome To BotEveryWhere Expense Assistant!',
  }));
  conv.ask(new Suggestions(intentSuggestions));
});


app.intent('RecordExpense', async (conv) => {
  const email = conv.user.email
  const {number, ExpenseCategory} = conv.parameters
  if (!conv.data.uid && email) {
    try{
      await db.collection("Expenses").doc(email).collection("Expense").add({email:email, amount: number, category: ExpenseCategory, date:new Date()});
      conv.ask(new SimpleResponse({
        speech: `Sucessfully recorded Expense of ${number} for category ${ExpenseCategory}`,
        text: `Sucessfully recorded Expense of ${number} for category ${ExpenseCategory}`,
      }));
      conv.ask(new Suggestions(intentSuggestions));
      console.log("Sucessfully added expense");
    }
    catch (e) {
      console.log("Failed to add an expense");
      console.log(e);
    }
  }
  else{
    conv.ask(new SignIn('To Record your expense we need you to signin'))
  }
  
});

app.intent('ask_for_sign_in_confirmation', (conv, params, signin) => {
  if (signin.status === 'OK') {
    console.log("sign in successfull");
    const payload = conv.user.profile.payload
    conv.ask(`I got your account details, ${payload.name}. What do you want to do next?`)
    conv.ask(new Suggestions(intentSuggestions));
  } else {
    conv.ask(`You need to sign in before using the app`)
  }
})

app.intent('setup_push', (conv) => {
  conv.ask(new UpdatePermission({intent: 'NMonthsExpense'}));
});

app.intent('finish_push_setup', async (conv) => {
  if (conv.arguments.get('PERMISSION')) {
    const userID = conv.arguments.get('UPDATES_USER_ID');
    console.log(conv.arguments);
    if(userID){
      const email = conv.user.email
      await db.collection("Expenses").doc(email).collection("Token").set({userID});
    }
    conv.close(`Ok, I'll start alerting you.`);
  }
  else{
    conv.close(`Ok, I won't alert you.`);
  }
});

app.intent('NMonthsExpense', async (conv, params) => {
  const email = conv.user.email
  const period = params[`date-period`];
  const date = params[`date`];
  if(period){
      const {startDate, endDate} = period;
      const dbResults = await db.collection("Expenses").doc(email).collection("Expense").where("date", ">=", new Date(startDate)).where("date", "<=", new Date(endDate)).get();
      let amount = 0;
      dbResults.forEach((doc) =>{
        amount = amount + parseFloat(doc.data().amount);
      })
      conv.ask(new SimpleResponse({
        speech: `Please find your expense`,
        text: `Please find your expense`,
      }));
      conv.ask(new BasicCard({
        text: `Your total expense for requested period is ***${amount}***`, // Note the two spaces before '\n' required for
        title: 'Expense Report',
        buttons: new Button({
          title: 'See Full Report',
          url: 'https://boteverywhere-ff53e.firebaseapp.com/',
        }),
      }))
      conv.ask(new Suggestions([...filterSuggestions,...pushNotificationSuggesion]));
  }
  else if (date){
    const dbResults = await db.collection("Expenses").doc(email).collection("Expense").where("date", ">=", new Date(date)).where("date", "<=", new Date(date)).get();
    let amount = 0;
      dbResults.forEach((doc) =>{
        amount = amount + parseFloat(doc.data().amount);
      })
      conv.ask(new SimpleResponse({
        speech: `Please find your expense`,
        text: `Please find your expense`,
      }));
      conv.ask(new BasicCard({
        text: `Your total expense for requested period is ***${amount}***`, // Note the two spaces before '\n' required for
        title: 'Expense Report',
        buttons: new Button({
          title: 'See Full Report',
          url: 'https://boteverywhere-ff53e.firebaseapp.com/',
        }),
      }))
      conv.ask(new Suggestions([...filterSuggestions,...pushNotificationSuggesion]));
  }
  else{
    conv.ask(new SimpleResponse({
      speech: `At this moment we provide option to see monthly expenses only`,
      text: `At this moment we provide option to see monthly expenses only`,
    }));
  }
  
})

exports.sayNumber = functions.https.onRequest(app);

exports.getLastMonthExpense  = functions.https.onRequest(async (request ,response) =>{
  const email = request.query.email;
  const startDate = DateTime.utc().startOf('month').toISO();
  const endDate = DateTime.utc().endOf('month').toISO();
  const dbResults = await db.collection("Expenses").doc(email).collection("Expense").where("date", ">=", new Date(startDate)).where("date", "<=", new Date(endDate)).get();
  let results = [];
  dbResults.forEach((doc) => {
    results.push(doc.data())
  })
  const output =
  _(results)
    .groupBy('category')
    .map((objs, key) => ({
        'category': key,
        'amount': _.sumBy(objs, function(o) { return parseInt(o.amount); } )}))
    .value();
    return cors(request, response, () => {
      response.status(200).send(output);
    });
});
