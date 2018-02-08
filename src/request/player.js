var moment = require('moment')
var util = require('util')
var zlib = require('zlib')

var Request = require('./request')
var RequestBody = require('./body')
var debug = require('../utils/debug')

class Player {
    constructor(uuid) {
        this.questBlacklist = []
        this.missionBlacklist = []
        this.uuid = uuid
        this.playerId = null
        this.token = null
        this.sessionId = null
        this.failed = 0
    }

    async signup(name) {
        debug('Start signup')
        let body = new RequestBody()
        body.append('uuid', this.uuid)
        body.append('platform', 1)
        body.append('stepCode', 1)
        body.append('name', name)

        let request = new Request()
        request.init('POST', 'player/signup', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('Sign-up failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this.signup(name)
        }
        this.token = response.accessToken
        return true
    }

    async login() {
        debug('Start login')
        let body = new RequestBody()
        body.append('uuid', this.uuid)
        body.append('platform', 1)
        body.append('accessToken', this.token)
        body.append('appVersion', '1.0.4')

        let request = new Request()
        request.init('POST', 'player/login', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('Login failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this.login()
        }
        this.sessionId = response.sessionId
        return true
    }

    async getUser() {
        debug('Start get data')
        let request = new Request(this.sessionId)
        request.init('GET', 'player/get_all')
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('Get User data failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this.getUser()
        }
        this.playerId = response.player.id
        this.code = response.player.myCode
        return true
    }

    async simulation() {
        debug('Start simulation')
        let uselessEndpoint = ['player/quest/get_all', 'player/mission/get_all', 'quest_chapter/get_all']
        for (let url of uselessEndpoint) {
            await this._getAllInfo(url)
        }
        await this._takePresent(await this._recvPresentInfo())
        await this._setAdvInfo("1000000", 3)
    }

    async gacha() {
        let body = new RequestBody()
        body.append('gachaId', 1)
        body.append('drawType', 3)
        body.append('stepCode', 4)
        body.append('reDraw', false)

        let request = new Request(this.sessionId)
        request.init('POST', 'player/gacha/draw', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('Gacha failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this.gacha()
        }
    }

    async skipTutor() {
        let body = new RequestBody()
        body.append('stepCode', 5)
        let request = new Request(this.sessionId)
        request.init('GET', 'player/tutorial/party/set', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('skipTutor failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this.skipTutor()
        }
    }

    async buyFurniture(id, qty) {
        let body = new RequestBody({
            roomObjectId: id,
            amount: qty,
            tryBargain: "0"
        })

        let request = new Request(this.sessionId)
        request.init('POST', 'player/room_object/buy', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('buy furniture failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this.buyFurniture(id, qty)
        }
    }

    async setParty() {
        let body = new RequestBody()
        body.append('stepCode', 5)
        let request = new Request(this.sessionId)
        request.init('POST', 'player/tutorial/party/set', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('setParty failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this.setParty()
        }
        this.partyid = response.managedBattleParties[0].managedBattlePartyId
    }

    async skipAll() {
        debug('Start skip tutor')
        await this._setAdvInfo("1000004", -1)
    }

    async getMission() {
        debug('Start get missions')
        let request = new Request(this.sessionId)
        request.init('GET', 'player/mission/get_all')
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('get mission failed [%s]', response.resultCode))
            return await this.getMission()
        }
        return response.missionLogs.filter(item => {
            return item.state === 0 &&
                !this.missionBlacklist.includes(item.managedMissionId)
        })
    }

    async finishMission(mission) {
        let missionId = mission.managedMissionId
        if (this.missionBlacklist.includes(missionId)) {
            return debug('Got a blocked mission. Ignored')
        }
        debug('Start finish mission')
        let body = new RequestBody()
        body.append('managedMissionId', missionId)
        let request = new Request(this.sessionId)
        request.init('POST', 'player/mission/complete', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            this.failed++
            debug(util.format('finishMission failed [%s]', response.resultCode))
            if (this.failed < 3) {
                await this.setMission(mission)
                return await this.finishMission(mission)
            } else {
                this.missionBlacklist.push(missionId)
            }
        }
        this._resetFailed()
    }

    async setMission(mission) {
        let body = new RequestBody()
        body.append('missionLogs', [mission])

        let request = new Request(this.sessionId)
        request.init('POST', 'player/mission/set', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('Set mission failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            if (this.failed < 3) {
                return await this.setMission(mission)
            }
        }
    }

    async isBanned() {
        let request = new Request(this.sessionId)
        request.init('GET', 'player/get_all')
        let response = await request.execute()
        if (response.resultCode !== 0 && response.resultCode < 200) {
            return await this.isBanned()
        }
        return response.resultCode > 200
    }
    
    async getStoryQuest() {
        debug('Start get story quest')
        let request = new Request(this.sessionId)
        request.init('GET', 'player/quest/get_all')
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('get story quest failed [%s]', response.resultCode))
            return await this.getStoryQuest()
        }
        return response.quests.filter(item => item.clearRank === 0)
    }
    
    async getEventQuest() {
        debug('Start get event quest')
        let request = new Request(this.sessionId)
        request.init('GET', 'player/quest/get_all')
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('get quest event failed [%s]', response.resultCode))
            return await this.getEventQuest()
        }
        return response.eventQuests
    }

    async useItem() {
        let body = new RequestBody()
        body.append('type', 1)
        body.append('num', 1)
        body.append('itemId', -1)

        let request = new Request(this.sessionId)
        request.init('POST', 'player/stamina/add', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('Use item failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            if (this.failed < 3) {
                return await this.useItem()
            }
        }
    }

    async addQuest(isEvent, quest) {
        let questData = null,
            managedBattlePartyId = -1,
            supportCharacterId = -1,
            type = (!isEvent ? 1 : 2) + (!isEvent ? quest.advOnly : quest.quest.advOnly) * 2,
            questId = quest.id
        if (!quest.advOnly) {
            questData = this._getQuestData(quest.id, this.partyid)
            managedBattlePartyId = this.partyid
            supportCharacterId = 1750004716
        }
        let body = new RequestBody()
        body.append('type', type)
        body.append('questId', questId)
        body.append('managedBattlePartyId', managedBattlePartyId)
        body.append('supportCharacterId', supportCharacterId)
        body.append('questData', questData)

        let request = new Request(this.sessionId)
        request.init('POST', 'player/quest_log/add', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            this.useItem()
            this.failed++
            debug(util.format('Add quest failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            if (this.failed < 3) {
                return await this.addQuest(isEvent, quest)
            }
        } else {
            return response.orderReceiveId
            this._resetFailed()
        }
    }

    async setQuest(isEvent, quest, orderReceiveId) {
        let body = new RequestBody()
        body.append('orderReceiveId', orderReceiveId)
        body.append('state', 2)
        body.append('clearRank', 3)
        body.append('skillExps', '')
        body.append('dropItems', '')
        body.append('killedEnemies', '')
        body.append('weaponSkillExps', '')
        body.append('friendUseNum', 1)
        body.append('masterSkillUseNum', 0)
        body.append('uniqueSkillUseNum', 0)
        body.append('stepCode', 0)

        let request = new Request(this.sessionId)
        request.init('POST', 'player/quest_log/set', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('Set quest failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            if (this.failed < 3) {
                return await this.setQuest(isEvent, quest, orderReceiveId)
            }
        }
    }

    _getQuestData(id, partyid) {
        var input = new Buffer(`"Ver":"1.0.4","SubVer":"4","Phase":-1,"RecvID":-1,"QuestID":${id},"PtyMngID":${partyid},"ContCount":0,"WaveIdx":0,"MstSkillCount":0,"MstSkillFlg":false,"FrdType":1,"FrdCharaID":14002000,"FrdCharaLv":57,"FrdLB":2,"FrdUSLv":7,"FrdCSLvs":[10,8],"FrdWpID":1002,"FrdWpLv":15,"FrdWpSLv":15,"Frdship":4,"FrdRemainTurn":0,"FrdUseCount":0,"FrdUsed":false,"Gauge":{"Val":0.0},"TBuff":{"m_List":[{"m_CondType":0,"m_Cond":5,"m_Param":{"m_Type":0,"m_Val":1.0}},{"m_CondType":0,"m_Cond":5,"m_Param":{"m_Type":1,"m_Val":1.0}},{"m_CondType":0,"m_Cond":5,"m_Param":{"m_Type":2,"m_Val":1.0}},{"m_CondType":0,"m_Cond":5,"m_Param":{"m_Type":3,"m_Val":1.0}},{"m_CondType":0,"m_Cond":5,"m_Param":{"m_Type":4,"m_Val":1.0}},{"m_CondType":0,"m_Cond":5,"m_Param":{"m_Type":5,"m_Val":1.0}}]},"Enemies":{"m_Waves":[{"m_Enemies":[{"m_EnemyID":19010001,"m_EnemyLv":1,"m_DropID":9978},{"m_EnemyID":19010001,"m_EnemyLv":1,"m_DropID":9978},{"m_EnemyID":-1,"m_EnemyLv":-1,"m_DropID":-1}]},{"m_Enemies":[{"m_EnemyID":19010001,"m_EnemyLv":1,"m_DropID":9978},{"m_EnemyID":19010001,"m_EnemyLv":1,"m_DropID":9978},{"m_EnemyID":-1,"m_EnemyLv":-1,"m_DropID":-1}]}]},"ScheduleItems":[{"Items":[{"Datas":[{"ID":1,"Num":1}]},{"Datas":[]},{"Datas":[]}]},{"Items":[{"Datas":[{"ID":2002,"Num":1}]},{"Datas":[{"ID":1,"Num":1}]},{"Datas":[]}]}],"PLs":[],"PLJoinIdxs":[]`)
        var compressed = zlib.deflateSync(input)
        return compressed.toString('base64')
    }

    _resetFailed() {
        this.failed = 0
    }

    async _getAllInfo(endpoint) {
        let request = new Request(this.sessionId)
        request.init('GET', endpoint)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format(`${endpoint} failed [%s] (Reason: %s)`, response.resultCode, response.resultMessage))
            return await this._getAllInfo(endpoint)
        }
    }

    async _recvPresentInfo() {
        let request = new Request(this.sessionId)
        request.init('GET', 'player/present/get_all')
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('recvPresent failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this._recvPresentInfo()
        }
        return response.presents.map(presents => {
            return presents.managedPresentId
        })
    }

    async _takePresent(presents) {
        let request = new Request(this.sessionId)
        request.init('GET', `player/present/get?managedPresentId=${presents}`)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('takePresent failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this._takePresent(presents)
        }
    }

    async _setAdvInfo(advId, stepCode) {
        let body = new RequestBody()
        body.append('advId', advId)
        body.append('stepCode', stepCode)
        let request = new Request(this.sessionId)
        request.init('POST', 'player/adv/add', body)
        let response = await request.execute()
        if (response.resultCode !== 0) {
            debug(util.format('saveAdvInfo failed [%s] (Reason: %s)', response.resultCode, response.resultMessage))
            return await this._setAdvInfo(advId, stepCode)
        }
    }

    toString() {
        return JSON.stringify({
            uuid: this.uuid,
            playerId: this.playerId,
            token: this.token,
            sessionId: this.sessionId,
            myCode: this.code
        })
    }
}

module.exports = Player