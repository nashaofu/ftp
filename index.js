var FTP = require('./lib/ftp');
var app = new FTP({
    host: '192.168.1.100',
    port: 21,
    type: 'ftp',
    user: 'diaocheng@outlook.com',
    password: 'lock274394',
    timeout: 30
});
// app.rename('foo.remote-copy11.txt', 'foo.remote-copy10.txt', function (error, data) {
//     console.log(data, 're1')
// });
// app.rename('foo.remote-copy10.txt', 'foo.remote-copy11.txt', function (error, data) {
//     console.log(data, 're2')
// });
app.status('./', function(error, data) {
    console.dir(data);
});
// app.list('./', function (error, data) {
//     console.log(data, 'list');
// });
// app.delete('foo.remote-copy11.txt', function (error, data) {
//     console.log(data, 'delete')
// });
// app.rmd('cdw', function (error, data) {
//     console.log(error, data);
// });

// console.log(app)