const AccMan = require('../engine/access-manager');
const DashMan = require('../engine/dashboard-manager');
const CalMan = require('../engine/calendar-manager');
const SafMan = require('../engine/safespotter-manager');
const ErrorHandler = require('../engine/error-handler');

module.exports = function (app, passport, config) {

    const site_URL = (config['site_URL'].includes('localhost') ? 'http://localhost:4200' : '') + '/#/preferences/api-keys?err=true';

    /* PATHs */
    const amPath = '/users';
    const keysPath = '/keys';
    const dashPath = '/dashboards';
    const calPath = '/calendar';
    const messPath = '/message';
    const safePath = '/safePath';


    /* AUTH */
    const reqAuth = passport.authenticate('jwt', {session: false});

    const admin = '0';
    const user = '1';
    const editor = '2';
    const analyst = '3';
    const all = [admin, user, editor, analyst];

    // TODO gestire le delete bene: se il risultato restituito dalla query è 0, allora non ha eliminato niente

    /****************** ACCESS MANAGER ********************/
    app.post('/login', AccMan.basicLogin);

    /****************** CRUD USERS ********************/
    app.post(`${amPath}/create/`, AccMan.createUser);
    app.get(`${amPath}/getFromId/`, reqAuth, AccMan.roleAuth(all), AccMan.getUserById);
    app.put(`${amPath}/update/`, reqAuth, AccMan.roleAuth(all), AccMan.updateUser);
    app.delete(`${amPath}/delete/`, reqAuth, AccMan.roleAuth([admin]), AccMan.deleteUser);


    /****************** CALENDAR MANAGER ******************/
    app.get(`${calPath}/getEvents`, reqAuth, AccMan.roleAuth(all), CalMan.getEvents);
    app.post(`${calPath}/addEvent`, reqAuth, AccMan.roleAuth(all), CalMan.addEvent);
    app.put(`${calPath}/updateEvent`, reqAuth, AccMan.roleAuth(all), CalMan.getEvents);
    app.delete(`${calPath}/deleteEvent`, reqAuth, AccMan.roleAuth(all), CalMan.deleteEvent);

    /****************** SAFESPOTTER MANAGER ********************/
    app.get(`${safePath}/getData`, reqAuth, AccMan.roleAuth(all), SafMan.returnList)
    /****************** SOCKET IO ******************/

    const socket = require("socket.io");

    const server = app.listen(3000, () => {
        console.log('started in 3000')
    });

    const io = socket(server);

    var SafeSpotter = require('../models/mongo/mongo-safeSpotter')
    var Notification = require('../models/mongo/mongo-notification')
    var socketMap = [];

    io.on('connection', (socket) => {
        console.log("Client Connected");
        socketMap.push(socket);
        dataUpdate();
    });

    app.post('/SafeSpotter/create', function (req, res) {
        let tmp_critical;
        let allert;
        let id;
        (async () => {
            try {
                console.log("Calling for chart Create");

                if ((await SafeSpotter.find({id: req.body.id})).length != 0 && req.body.critical_issues >= 0 && req.body.critical_issues <= 5) {
                    tmp_critical = await SafeSpotter.find({id: req.body.id});
                    tmp_critical[0].critical_issues != req.body.critical_issues ? id = req.body.id : id = -1;
                    req.body.critical_issues == 5 ? allert = 1 : allert = 0;

                    await SafeSpotter.updateOne({id: req.body.id},
                        {
                            street: req.body.street,
                            condition: req.body.condition,
                            critical_issues: req.body.critical_issues,
                            condition_convert: convertCondition(req.body.critical_issues),
                            date: new Date()
                        })
                } else {
                    let safeSpotter = new SafeSpotter(req.body)
                    await safeSpotter.save();
                }

                if ((await SafeSpotter.find({id: req.body.id})).length != 0 && req.body.critical_issues >= 4 && req.body.critical_issues <= 5) {
                    let notification = new Notification(req.body)
                    await notification.save();
                }

                //dati su mongo
                dataUpdate(id, allert); //richiamo l'emissione
                res.json("Charts  Successfully Created"); //parse
            } catch (err) {
                console.log(err);
                //res.status(400).send(err);
            }
        })();
    });


    async function dataUpdate(num, allert) {
        console.log('Socket Emmit');
        const safespotter = await SafeSpotter.find().sort({date: -1});
        const notification = await Notification.find({});
        const count = await Notification.count({});
        for (let socketMapObj of socketMap) {
            if (safespotter.length > 0) {
                socketMapObj.emit('dataUpdate', [
                    safespotter, num, allert, notification, count]);
            }
        }


    }

    function convertCondition(input){
    switch (parseInt(input)) {
        case 0:
            return 'NESSUNA';
        case 1:
            return 'BASSA';
        case 2:
            return 'DISCRETA';
        case 3:
            return 'MODERATA';
        case 4:
            return 'ALTA';
        case 5:
            return 'MASSIMA';
        }
    }

    /****************** ERROR HANDLER ********************/
    app.use(ErrorHandler.fun404);

};

