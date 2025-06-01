const http = require('http');
const fs = require('fs');
const path = require('path');
const Web3 = require('web3').default;

const contractAbi = [
    {
        "inputs": [
            { "internalType": "string", "name": "_name", "type": "string" },
            { "internalType": "uint256", "name": "_bal", "type": "uint256" }
        ],
        "name": "regUser",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "string", "name": "_from", "type": "string" },
            { "internalType": "string", "name": "_to", "type": "string" },
            { "internalType": "uint256", "name": "_amount", "type": "uint256" }
        ],
        "name": "transBal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "string", "name": "_name", "type": "string" }
        ],
        "name": "checkBal",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];
const contractAddress = '0xfa5063c527b052357496c75bf0b364687f07b46b';

const web3 = new Web3('http://127.0.0.1:8545');
const contractInstance = new web3.eth.Contract(contractAbi, contractAddress);

const server = http.createServer(async (req, res) => {
    // CORS 헤더 추가
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (!contractInstance) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '스마트 계약이 아직 준비되지 않았습니다. 서버 로그를 확인하거나 잠시 후 다시 시도해주세요.' }));
        return;
    }

    if (req.url === '/' && req.method === 'GET') {
        const filePath = path.join(__dirname, 'views', 'index.html');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                console.error('[오류] index.html 파일 읽기 실패:', err);
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('서버 내부 오류: HTML 파일을 읽을 수 없습니다.');
                return;
            }
            let modifiedContent = content.replace('const contractABI = [];', 'const contractABI = ' + JSON.stringify(contractAbi) + ';');
            modifiedContent = modifiedContent.replace("const contractAddress = '';", "const contractAddress = '" + contractAddress + "';");
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(modifiedContent);
        });
    } else if (req.url === '/register' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { name, balance } = JSON.parse(body);
                console.log('[register 요청] name:', name, ', balance:', balance);

                if (!name || typeof name !== 'string' || name.trim() === '' || balance === undefined || isNaN(parseInt(balance)) || parseInt(balance) < 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: '올바른 이름과 0 이상의 초기 잔액을 입력해야 합니다.' }));
                    return;
                }
                const accounts = await web3.eth.getAccounts();
                const regReceipt = await contractInstance.methods.regUser(name.trim(), parseInt(balance)).send({ from: accounts[0], gas: '1000000', gasPrice: web3.utils.toWei('30', 'gwei') });
                console.log('[register 트랜잭션 해시]:', regReceipt.transactionHash);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ message: `사용자 '${name.trim()}' 등록 및 ${parseInt(balance)} GACHON 입금 완료.` }));
            } catch (error) {
                console.error('[API 오류] /register:', error.message);
                let errorMessage = '사용자 등록 중 오류 발생: ' + error.message;
                if (error.message && error.message.includes("revert")) {
                    const reasonMatch = error.message.match(/revert (.*)/);
                    if (reasonMatch && reasonMatch[1]) {
                        errorMessage = `사용자 등록 실패: ${reasonMatch[1]}`;
                    } else if (error.data && typeof error.data === 'object' && error.data.message) {
                        errorMessage = `사용자 등록 실패: ${error.data.message}`;
                    } else if (typeof error.data === 'string' && error.data.includes('revert')) {
                        const dataReasonMatch = error.data.match(/revert (.*)/);
                        if (dataReasonMatch && dataReasonMatch[1]) {
                            errorMessage = `사용자 등록 실패: ${dataReasonMatch[1]}`;
                        }
                    }
                }
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: errorMessage }));
            }
        });
    } else if (req.url.startsWith('/balance/') && req.method === 'GET') {
        try {
            const name = decodeURIComponent(req.url.split('/')[2]);
            if (!name || typeof name !== 'string' || name.trim() === '') {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '조회할 사용자의 이름을 정확히 입력해야 합니다.' }));
                return;
            }
            const balance = await contractInstance.methods.checkBal(name.trim()).call();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ name: name.trim(), balance: balance.toString() }));
        } catch (error) {
            console.error('[API 오류] /balance:', error.message);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '잔액 조회 중 오류 발생: ' + error.message }));
            }
        }
    } else if (req.url === '/transfer' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { from, to, amount } = JSON.parse(body);
                if (!from || typeof from !== 'string' || from.trim() === '' || 
                    !to || typeof to !== 'string' || to.trim() === '' || 
                    amount === undefined || isNaN(parseInt(amount)) || parseInt(amount) <= 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: '올바른 보내는 사람, 받는 사람 이름과 0보다 큰 송금액을 입력해야 합니다.' }));
                    return;
                }
                if (from.trim() === to.trim()) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: '보내는 사람과 받는 사람이 같을 수 없습니다.' }));
                    return;
                }
                const accounts = await web3.eth.getAccounts();
                const transReceipt = await contractInstance.methods.transBal(from.trim(), to.trim(), parseInt(amount)).send({ from: accounts[0], gas: '1000000', gasPrice: web3.utils.toWei('30', 'gwei') });
                console.log('[transfer 트랜잭션 해시]:', transReceipt.transactionHash);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ message: `'${from.trim()}'님이 '${to.trim()}'님에게 ${parseInt(amount)} GACHON 송금 완료.` }));
            } catch (error) {
                console.error('[API 오류] /transfer:', error.message);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                let errorMessage = '송금 중 오류 발생: ' + error.message;
                if (error.message && error.message.includes("revert")) {
                    const reasonMatch = error.message.match(/revert (.*)/);
                    if (reasonMatch && reasonMatch[1]) {
                        try {
                            const nestedError = reasonMatch[1].substring(reasonMatch[1].indexOf('{'), reasonMatch[1].lastIndexOf('}') + 1);
                            if (nestedError) {
                                const parsedReason = JSON.parse(nestedError);
                                errorMessage = `송금 실패: ${parsedReason.message || reasonMatch[1]}`;
                            } else {
                                errorMessage = `송금 실패: ${reasonMatch[1]}`;
                            }
                        } catch(e) {
                            errorMessage = `송금 실패: ${reasonMatch[1]}`;
                        }
                    } else if (error.data && typeof error.data === 'object' && error.data.message) {
                        errorMessage = `송금 실패: ${error.data.message}`;
                    } else if (typeof error.data === 'string' && error.data.includes('revert')){
                        const dataReasonMatch = error.data.match(/revert (.*)/);
                        if(dataReasonMatch && dataReasonMatch[1]){
                            errorMessage = `송금 실패: ${dataReasonMatch[1]}`;
                        }
                    }
                }
                res.end(JSON.stringify({ error: errorMessage }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('요청하신 페이지를 찾을 수 없습니다 (Not Found).');
    }
});

server.listen(3000, '0.0.0.0', () => {
    console.log('=====================================================');
    console.log(' GachonCoin DApp 서버가 성공적으로 시작되었습니다! ');
    console.log('=====================================================');
    console.log(` 웹 브라우저에서 http://127.0.0.1:3000 으로 접속하세요.`);
    console.log(` 스마트 계약 (GachonCoin) 주소: ${contractAddress}`);
    console.log('=====================================================');
});