// JSON Request
class RequestBody {
    constructor(m_parameters = {}) {
        this.m_parameters = m_parameters
    }

    append(key, value) {
        this.m_parameters[key] = value
    }
    
    toString() {
        return this.m_parameters ? JSON.stringify(this.m_parameters) : ""
    }
}

module.exports = RequestBody