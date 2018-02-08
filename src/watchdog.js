var crypto = require('crypto')
var fs = require('fs')
var uuidv4 = require('uuid/v4')
var Randomstring = require('randomstring')
var client = require('adbkit').createClient()

var debug = require('./utils/debug')
var Player = require('./request/player')

const version = 19
const NOX_DIR = 'C:\\Users\\KarasumaChitose\\Nox_share\\Other'
const USERNAME = 'IKEA'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

async function main() {
    let autoPush = true
    let player = null
    while(1) {
        if (player === null || await player.isBanned() || (!autoPush && !fs.existsSync(`${NOX_DIR}\\a.d`))) {
            player = new Player(uuidv4())
            await player.signup(USERNAME)
            await player.login()
            await player.getUser()
            await player.simulation()
            await player.setParty()
            await player.skipAll()
            createSaveData(player)
            if (autoPush) {
                await pushToDevice(getPortByDeviceNum(2))
            } else {
                fs.createReadStream('a.d').pipe(fs.createWriteStream(`${NOX_DIR}\\a.d`))
            }
        }
        await sleep(5000)
    }
}
main()

async function createSaveData(player) {
    var Pack = [132, 174, 109, 95, 67, 111, 110, 102, 105, 114, 109, 101, 100, 86, 101, 114, 0, 166, 109, 95, 85, 85, 73, 68, 218, 0, 36]
    var Pack2 = [173, 109, 95, 65, 99, 99, 101, 115, 115, 84, 111, 107, 101, 110, 218, 0, 36]
    var Pack3 = [168, 109, 95, 77, 121, 67, 111, 100, 101, 170]
    let savedata = [...Pack, ...Buffer.from(player.uuid), ...Pack2, ...Buffer.from(player.token), ...Pack3, ...Buffer.from(player.code)]
    let buffer = new Buffer(savedata)
    
    let num = 1234567890
    let b = num & 127
    num = readInt32(num & -65281 | 65280 & version << 8)
    let iv = Buffer.from(Randomstring.generate(16), 'ascii')
    let key = Buffer.from('7gyPmqc54dVNB3Te6pIpd2THj2y3hjOP', 'ascii')
    var cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    var crypted = Buffer.concat([cipher.update(buffer),cipher.final()])
    iv.map((item, index, array) => {
        array[index] += 96 + index
    })
    fs.writeFileSync('a.d', new Buffer([...num, iv.length + b, ...iv, ...readInt32(crypted.length), ...crypted]))
}

async function pushToDevice(port = 62001) {
    await client.connect(`127.0.0.1:${port}`)
    await client.listDevices().map(async device => {
        await client.shell(device.id, 'am force-stop com.aniplex.kirarafantasia')
        return client.push(device.id, 'a.d', '/storage/sdcard0/Android/data/com.aniplex.kirarafantasia/files/a.d')
        .then(function(transfer) {
            return new Promise((resolve, reject) => {
                transfer.on('end', () => {
                    debug('Push complete')
                    resolve()
                })
                transfer.on('error', reject)
            })
        })
    }).catch(err => {
        autoPush = false
        console.log(err.message)
    })
}

function readInt32(num) {
    return [
        (num & 0x000000ff),
        (num & 0x0000ff00) >> 8,
        (num & 0x00ff0000) >> 16,
        (num & 0xff000000) >> 24,
   ]
}

function getPortByDeviceNum(num) {
    return 62000 + num + (num > 1 && 23)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function finishAllMission(player) {
    let missions = await player.getMission()
    while (missions.length !== 0) {
        for (let mission of missions) {
            await player.finishMission(mission)
        }
        missions = await player.getMission()
        await sleep(500)
    }
}