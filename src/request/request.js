var fetch = require('isomorphic-fetch')
var sha256 = require('sha256')

class Request {
    constructor(token = null) {
        this.token = token
    }

    init(method, endpoint, body = "") {
        this.method = method
        this.endpoint = endpoint
        this.body = body
        this.header = {
            'Unity-User-Agent': 'app/0.0.0; iOS 11.0.3; iPhone7Plus',
            'X-Unity-Version': '5.5.4f1',
            'X-START-AB': 3,
            'Content-Type': 'application/json; charset=UTF-8',
            'User-Agent': 'kirarafantasia/17 CFNetwork/887 Darwin/17.0.0',
            'X-STAR-REQUESTHASH': sha256([this.token, `/api/${this.endpoint}`, this.body, '85af4a94ce7a280f69844743212a8b867206ab28946e1e30e6c1a10196609a11'].filter(item => item).join(' ')),
            ...(this.token ? {'X-STAR-SESSION-ID': this.token} : {}),
        }
    }

    async execute() {
        let serverURL = `https://krr-prd.star-api.com/api/${this.endpoint}`
        let result = await fetch(serverURL, {
            method: this.method,
            headers: this.header,
            body: this.body,
        })
        return await result.json()
    }
}

module.exports = Request