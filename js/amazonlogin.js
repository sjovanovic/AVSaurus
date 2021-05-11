// below is the Amazon login code. 
// Access token is saved to local storage and expired automatically
// Example:
/*
var alogin = new AmazonLogin({
    clientID: clientID,
    productID: productID,
    ready: ()=>{
        let b = document.getElementById('startbutton')
        b.addEventListener('click', (ev)=>{
            b.style.display = 'none'
            alogin.getAccessToken((token)=>{
                doSomethingWithToken(token)
            })
        })
    }
})
*/
function AmazonLogin(opts) {
    if (!opts) opts = {}
    let inst = this

    let config = {}
    for (let i in opts) config[i] = opts[i]

    var clientID = config.clientID
    var productID = config.productID
    if (!clientID || !productID) throw Error('Missing clientID or productID')

    var deviceKey = 'alexa_deviceId'
    var deviceId = localStorage.getItem(deviceKey)
    var tokenKey = 'atoken_akey'
    if (!deviceId) {
        deviceId = (Math.random() + '').substring(2)
        localStorage.setItem(deviceKey, deviceId)
    }

    var options = {
        interactive: 'auto',
        pkce: true,
        scope: 'alexa:all',
        scope_data: {
            'alexa:all': {
                "productID": productID,
                "productInstanceAttributes": {
                    "deviceSerialNumber": deviceId
                }
            }
        },
        popup: true
    };

    let removeToken = () => {
        localStorage.removeItem(tokenKey)
    }
    inst.removeToken = removeToken

    let getToken = () => {
        let resp = localStorage.getItem(tokenKey)
        let valid = false
        if (resp) {
            try {
                resp = JSON.parse(resp)
                if (resp && resp.access_token && resp.expires_in && resp.time) {
                    let expires = new Date(resp.time + (resp.expires_in * 1000))
                    let now = new Date()
                    if (now < expires) {
                        valid = true
                    }
                }
            } catch (err) {}
        }
        if (valid) {
            return resp.access_token
        } else {
            removeToken()
            return null
        }
    }

    let getAccessToken = (cb) => {
        if (!cb) cb = function () {}
        let token = getToken()
        if (token) return cb(token)
        amazon.Login.authorize(options, function (response) {
            if (response.error) {
                console.error('oauth authorize error ' + response.error);
                removeToken()
                if (config.error && typeof config.error == 'function') config.error(new Error(response.error))
                return;
            }
            amazon.Login.retrieveToken(response.code, function (response) {
                if (response.error) {
                    console.log('oauth retrieveToken error ' + response.error);
                    removeToken()
                    if (config.error && typeof config.error == 'function') config.error(new Error(response.error))
                    return;
                }
                response.time = new Date().getTime()
                localStorage.setItem(tokenKey, JSON.stringify(response))
                cb(response.access_token)
            });
        })
    }
    inst.getAccessToken = getAccessToken

    // start avsaurus on sucessful login
    window.onAmazonLoginReady = () => {
        amazon.Login.setClientId(clientID);
        if (config.ready && typeof config.ready == 'function') config.ready(inst)
    }

    // load amazon lib.
    (function (d) {
        var a = d.createElement('script');
        a.type = 'text/javascript';
        a.async = true;
        a.id = 'amazon-login-sdk';
        a.src = 'https://assets.loginwithamazon.com/sdk/na/login1.js';
        d.getElementById('amazon-root').appendChild(a);
    })(document);
}