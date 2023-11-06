const mysql = require('mysql');;

const connection = mysql.createConnection({
    host:'localhost',
    database:'test',
    user: 'root',
    password:''
})

connection.connect(function(error){
    if(error)
    {
        throw error;
    }
    else
    {
        console.log('MySQL database connected successfully!.')
    }
})

module.exports = connection;