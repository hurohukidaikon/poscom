const poscom = () => {
  // パラメータ
  // const mode = 0; // -1 = 受信のみ, 1 = 送信のみ, 0 = 両方
  const getPosInterval = 60000; // ms
  // const getPosInterval = 2 * 60 * 1000; // minutes x seconds x 100 ms
  const reconnectInterval = 10000; // ms
  const maximumAge = 100;
  const timeout = 1000;
  const enableHighAccuracy = true;

  // 内部変数
  let peer = null;
  let connections = {};
  let lastPeerId = null;
  let beforeLatitude, beforeLongitude = null;

  // HTMLエレメント
  const elements = {
    id: document.getElementById('id'),
    copyBtn: document.getElementById('copy'),
    connections: document.getElementById('connections'),
    status: document.getElementById('status'),
    message: document.getElementById('message'),
    idInput: document.getElementById('idInput'),
    joinBtn: document.getElementById('join'),
    sendBtn: document.getElementById('send')
  }

  // テキスト
  const texts = {
    geo: {
      direction: {
        n: "北",
        nne: "北北東",
        ne: "北東",
        ene: "東北東",
        e: "東",
        ese: "東南東",
        se: "南東",
        sse: "南南東",
        s: "南",
        ssw: "南南西",
        sw: "南西",
        wsw: "西南西",
        w: "西",
        wnw: "西北西",
        nw: "北西",
        nnw: "北北西"
      }
    }
  }

  // ==========
  // geo data
  // ==========

  // GPSデータ取得を試行
  function getPosition() {
    var getPos = (options) => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
    }

    getPos({maximumAge, timeout, enableHighAccuracy})
      .then((rawData) => { return getPosSuccess(rawData) })
      .then((data) => { send(data, 'geo') })
      .catch((err) => { getPosError(err) });
  }

  // GPS取得成功
  function getPosSuccess(pos) {
    let data = {
      createdAt: getTime(),
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      altitude: pos.coords.altitude,
      heading: pos.coords.heading,
      accuracy: pos.coords.accuracy,
      altitudeAccuracy: pos.coords.altitudeAccuracy
    }
    data['latitudeDirection'] = data.latitude >= 0 ? 'N' : 'S';
    data['longitudeDirection'] = data.longitude >= 0 ? 'E' : 'W';
    data['coordsStr'] = `${data.latitude}°${data.latitudeDirection}, ${data.longitude}°${data.longitudeDirection}`;
    data['headingByCoords'] = getHeading(beforeLatitude, beforeLongitude, data.latitude, data.longitude);
    data['direction'] = getDirection(data.headingByCoords);

    if (data.latitude && data.longitude) {
      beforeLatitude = data.latitude;
      beforeLongitude = data.longitude;
    }

    return data;
  }

  // GPS取得失敗
  function getPosError(err) {
    return err;
  }

  // ==========
  // communication
  // ==========

  function communication() {
    elements.copyBtn.addEventListener('click', copyTxt);
    elements.joinBtn.addEventListener('click', () => {
      join(elements.idInput.value);
    });

    init();
    watch();
  }

  function init() {
    peer = new Peer(null);
    let reconnection = debounce(reconnect, reconnectInterval);

    peer.on('open', (id) => {
      if (peer.id === null) {
        peer.id = lastPeerId;
      } else {
        lastPeerId = peer.id;
      }
      elements.id.value = peer.id;
      show(elements.status, `${getTime()} IDを取得し、通信回線を開きました`);
    });

    peer.on('connection', (c) => {
      const id = c.peer;

      if (connections[id] && connections[id].open) {
        show(elements.status, `${getTime()} ${id} は接続済みです`);
        return;
      }

      connections[id] = c;
      ready(id);
      show(elements.status, `${getTime()} ${id} に接続しました`);
    });

    peer.on('disconnected', () => { // 通信回線が切断された時などに発火
      show(elements.status, `${getTime()} 通信が切断されました`);

      peer.id = lastPeerId;
      peer._lastServerId = lastPeerId;
      reconnection();
    });

    peer.on('close', () => {
      connections = {};
      show(elements.status, `${getTime()} 通信回線が閉じました`);
    });

    peer.on('error', (err) => {
      show(elements.status, `${getTime()} エラー(${err.message})`);
    });
  }

  function watch(interval = 1000) {
    let getPosIntervalId;

    setInterval(() => {
      // console.log('watching');
      if (objLength(connections) === 0 && getPosIntervalId) {
        clearInterval(getPosIntervalId);
      }

      if (objLength(connections) === 1 && !getPosIntervalId) {
        getPosition();
        getPosIntervalId = setInterval(getPosition, getPosInterval);
      }
    }, interval);
  }

  function join(id) {
    if (typeof id !== 'string') {
      throw new Error('Argument "id" is must a string.');
    }

    if (connections[id] && connections[id].open) {
      show(elements.status, `${getTime()} ${id} は接続済みです`);
      return;
    }

    show(elements.status, `${getTime()} ${id} に接続を試みます`);
    connections[id] = peer.connect(id, { reliable: true });

    connections[id].on('open', () => {
      show(elements.status, `${getTime()} ${id} に接続しました(join)`);
    });

    connections[id].on('data', (data) => {
      receive(data, id);
    });

    connections[id].on('close', () => {
      connections[id] = null;
      show(elements.status, `${getTime()} ${id} を切断しました`);
    });

    connections[id].on('error', (err) => {
      show(elements.status, `${getTime()} ${id} に接続できませんでした(${err.message})`);
      delete connections[id];
    });
  }

  function ready(id) {
    connections[id].on('data', (data) => {
      receive(data);
    });

    connections[id].on('close', () => {
      connections[id] = null;
      show(elements.status, `${getTime()} ${id} を切断しました`);
    });

    connections[id].on('error', (err) => {
      show(elements.status, `${getTime()} エラー(${err.message})`);
    });
  }

  function reconnect() {
    console.log(`${getTime()} 再接続を試みます`);
    peer.reconnect();

    peer.on('open', () => {
      // 接続履歴が残っていたら再接続する
      console.log(connections);
      for (var id in connections) {
        if (connections[id] === null) {
          join(id);
        }
      }
    });
  }

  function send(body, type = 'message', sendTo = Object.keys(connections)) {
    if (!Array.isArray(sendTo)) {
      throw new Error('Argument "sendTo" is must a array.');
    } else if(sendTo.length === 0) {
      show(elements.status, `${getTime()} 有効な送信先がありません`);
      return;
    }

    const data = {
      type: type,
      sentFrom: peer.id,
      sentAt: getTime(),
      body: body
    }

    for (var i = 0; i < sendTo.length; i++) {
      if (connections[sendTo[i]].open) {
        connections[sendTo[i]].send(data);
      } else {
        show(elements.status, `${getTime()} ${sendTo[i]} は無効な送信先です`);
      }
    }

    console.log('sent data');
    console.log(data);
    show(elements.status, `${getTime()} ${sendTo} に送信しました`);

    let message = 'YOU: ';

    if (data.type === 'geo') {
      message += parthGeo(data.body);
    } else {
      message += JSON.stringify(data);
    }

    show(elements.message, message, 'append');
  }

  function receive(data, receivedFrom) {
    console.log('data received');
    console.log(data);
    show(elements.status, `${getTime()} ${receivedFrom} から受信しました`);

    let message = 'PEER: ';

    if (data.type === "geo") {
      message += parthGeo(data.body);
    } else {
      message += JSON.stringify(data);
    }

    show(elements.message, message, 'append');
  }

  // ==========
  // utility
  // ==========

  // 現在日時を返す
  function getTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = digitalize(now.getMonth() + 1);
    const day = digitalize(now.getDate());
    const hour = digitalize(now.getHours());
    const minute = digitalize(now.getMinutes());
    const second = digitalize(now.getSeconds());
    return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
  }

  // 2つの座標を元に方角を算出する
  function getHeading(x1, y1, x2, y2) {
    const rad = Math.atan2(y2 - y1, x2 - x1);

    // 角度が計算できなかったらnull
    if (!rad) {
      return null;
    }

    const offset = 90;
    const deg = rad * 180 / Math.PI;
    const degOffset = (deg + offset);

    if (degOffset < 0) {
      degOffset = 360 - degOffset;
    } else if (degOffset >= 360) {
      degOffset = degOffset - 360;
    }

    return degOffset;
  }

  // 方角を元に十六方位を返す
  function getDirection(deg) {
    if (!deg) {
      return null;
    }

    const sectionDeg = 360 / 16;
    const offset = sectionDeg / 2;
    // 0度が方位「北」の区間の中央を指すように区間の1/2オフセット
    const degOffset = deg + offset;

    if (0 <= degOffset && degOffset < sectionDeg * 1) {
      return texts.geo.direction.n;
    } else if (sectionDeg * 1 <= degOffset && degOffset < sectionDeg * 2) {
      return texts.geo.direction.nne;
    } else if (sectionDeg * 2 <= degOffset && degOffset < sectionDeg * 3) {
      return texts.geo.direction.ne;
    } else if (sectionDeg * 3 <= degOffset && degOffset < sectionDeg * 4) {
      return texts.geo.direction.ene;
    } else if (sectionDeg * 4 <= degOffset && degOffset < sectionDeg * 5) {
      return texts.geo.direction.e;
    } else if (sectionDeg * 5 <= degOffset && degOffset < sectionDeg * 6) {
      return texts.geo.direction.ese;
    } else if (sectionDeg * 6 <= degOffset && degOffset < sectionDeg * 7) {
      return texts.geo.direction.se;
    } else if (sectionDeg * 7 <= degOffset && degOffset < sectionDeg * 8) {
      return texts.geo.direction.sse;
    } else if (sectionDeg * 8 <= degOffset && degOffset < sectionDeg * 9) {
      return texts.geo.direction.s;
    } else if (sectionDeg * 9 <= degOffset && degOffset < sectionDeg * 10) {
      return texts.geo.direction.ssw;
    } else if (sectionDeg * 10 <= degOffset && degOffset < sectionDeg * 11) {
      return texts.geo.direction.sw;
    } else if (sectionDeg * 11 <= degOffset && degOffset < sectionDeg * 12) {
      return texts.geo.direction.wsw;
    } else if (sectionDeg * 12 <= degOffset && degOffset < sectionDeg * 13) {
      return texts.geo.direction.w;
    } else if (sectionDeg * 13 <= degOffset && degOffset < sectionDeg * 14) {
      return texts.geo.direction.wnw;
    } else if (sectionDeg * 14 <= degOffset && degOffset < sectionDeg * 15) {
      return texts.geo.direction.nw;
    } else if (sectionDeg * 15 <= degOffset && degOffset < sectionDeg * 16) {
      return texts.geo.direction.nnw;
    }
    return null;
  }

  // 有効数字の桁数を揃える(元の値, 桁数)
  function decimalize(val, digit) {
    if (typeof val !== 'number') {
      return val;
    }
    return val.toFixed(digit);
  }

  // 一桁の数字の頭にゼロをつける
  function digitalize(val) {
    if (val < 10) {
      return `0${val}`
    }
    return val;
  }

  // テキストを表示する
  function show(el, txt, mode) {
    const oldTxt = el.innerHTML;

    if (mode === 'append') {
      el.innerHTML = `${oldTxt}<br>${txt}`;
    } else if (mode === 'prepend') {
      el.innerHTML = `${txt}<br>${oldTxt}`;
    } else {
      el.innerHTML = txt;
    }
    console.log(txt);


    elements.connections.innerHTML = '接続中の相手がいません';
    const keys = Object.keys(connections)
    for (var i = 0; i < keys.length; i++) {
      if (i === 0) {
        elements.connections.innerHTML = '';
      }
      elements.connections.innerHTML += `${keys[i]}<br>`
    }
    console.log(connections);
  }

  // テキストをコピーする
  function copyTxt() {
    elements.id.select();
    document.execCommand('copy');
    show(elements.status, `${getTime()} IDをクリップボードにコピーしました`);
  }

  // オブジェクトの要素数
  function objLength(obj) {
    if (typeof obj === 'object') {
      return Object.keys(obj).length;
    } else {
      throw new Error('Argument "obj" is must a object.');
    }
  }

  // オブジェクトの値をインデックスで取得
  function objByIndex(obj, index) {
    if (typeof index === 'string' && index === 'first') {
      return obj[Object.keys(obj)[0]];
    } else if (typeof index === 'string' && index === 'last') {
      return obj[Object.keys(obj)[Object.keys(obj).length - 1]];
    } else if (typeof index === 'number') {
      return obj[Object.keys(obj)[index]];
    } else {
      throw new Error('Argument "index" is must a number or string(first or last).');
    }
  }

  // 負荷対策（一定時間毎に実行）
  const throttle = (callback, interval = 500) => {
    let lastTime = Date.now() - interval;
    return () => {
      if (lastTime + interval < Date.now()) {
        lastTime = Date.now();
        callback();
      }
    }
  }

  // 負荷対策（一定時間後に実行）
  const debounce = (callback, interval = 500) => {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(callback, interval);
    }
  }

  function parthGeo(data) {
    const createdAt = data.createdAt;
    const coordsStr = data.coordsStr;
    const headingByCoords = data.headingByCoords;
    const str = `${createdAt}, 座標: ${coordsStr}, 方位: ${headingByCoords}`

    return str;
  }

  // ==========
  // execute
  // ==========
  communication();
}

window.addEventListener('DOMContentLoaded', () => {
  poscom();
});
