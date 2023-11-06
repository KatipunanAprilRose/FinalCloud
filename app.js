const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const bodyParser = require('body-parser');
const upload = multer({ dest: 'uploads/' });
require("dotenv").config();

const app = express();
app.use(express.json());

var database = require('./database')
var session = require('express-session');
const { request } = require('http');
const { response } = require('express');

app.use(session({
  secret: 'compress',
  resave: true,
  saveUninitialized: true
}))

app.use(bodyParser.urlencoded({ extended: true }));

const s3UrlQueue = []; // Shared queue to store S3 URLs

// Initialize SQS
const sqs = new AWS.SQS({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: 'ap-southeast-2',
});

const sqsQueueURL = process.env.SQS_URL;

app.post('/compress', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  // update database user transaction table path column
  // add thhe key to path column
  if(req.session.user_id)
  {
    query = `
    UPDATE user_transaction
    SET path = "${req.file.originalname + '.bz2'}"
    WHERE id = "${req.session.user_id}"
    `

    database.query(query, function (err, result) {
      if (err) throw err;
      console.log(result.affectedRows + " record(s) updated");
    });
  }

  // Send a message to the SQS queue to process the compression
  const messageParams = {
    QueueUrl: sqsQueueURL,
    MessageBody: JSON.stringify({
      originalFilePath: req.file.path,
      originalFileName: req.file.originalname,   
    }),
  };

  sqs.sendMessage(messageParams, (sqsErr, sqsData) => {
    if (sqsErr) {
      console.error('Error sending message to SQS:', sqsErr);
      res.status(500).send('Error sending message to SQS');
    } else {
      console.log('Message sent to SQS:', sqsData.MessageId);      
    }
  });
  
 res.send('ok');
});

app.post('/store-s3-url', (req, res) => {
  const s3Url = req.body.s3Url;
  s3UrlQueue.push(s3Url); // Push the S3 URL to the shared queue
  res.status(200).send('ok');
});

app.get('/retrieve-s3-url', (req, res) => {
  if (s3UrlQueue.length === 0) {
    res.status(404).send('S3 URL not available yet.');
  } else {
    const s3Url = s3UrlQueue.shift(); // Retrieve and remove the first URL from the queue    
    res.json({ s3Url });
  }
});

// Login 
app.post('/login', (request, response, next) => {
  var user_name = request.body.user_name;
  var user_password = request.body.user_password;

  console.log(user_name)
  console.log(user_password)
  if(user_name && user_password)
  {
    query = `
    SELECT * FROM user_transaction
    WHERE username = "${user_name}"
    `
    database.query(query, function(error,data){
      if(data.length > 0)
      {
        for(var count = 0; count < data.length; count++)
        {
          if(data[count].password == user_password)
          {
            request.session.user_id = data[count].id;
            request.session.user_name = data[count].username;
            request.session.path = data[count].path;
            response.redirect("/");
          }
          else
          {
            response.send('Incorrect Password');
          }
        }
      }
      else
      {
        response.send('Incorrect Email Address');
      }
      response.end();
    })
  }
  else
  {
    response.send('Please Enter Username and Password Details!...')
    response.end(); 
  }
});

app.get('/logout', function(request, response, next){
  request.session.destroy();
  response.redirect("/")
})

// static files
app.use(express.static('public'));
app.use('/css',express.static(__dirname+ 'public/css'));
app.use('/img',express.static(__dirname+ 'public/img'));

// set views
app.set('views','./views')
app.set('view engine','ejs')

app.get('', (req, res) => {
  res.render('index',{session:req.session});
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});