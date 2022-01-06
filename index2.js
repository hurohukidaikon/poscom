var map;
function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 0, lng: 0 },
    zoom: 15,
    disableDefaultUI: true,
    styles: [
      {
        featureType: "all",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
      },
    ]
  });
}

const poscom = () => {
  // パラメータ
  const getPosInterval = 10 * 1000; // minutes x seconds x 1000 ms
  const sendInterval = 4 * 60 * 1000;
  const reconnectInterval = 1000; // ms

  // 内部変数
  let peer = null;
  let connections = {};
  let beforeLatitude, beforeLongitude;
  let mode = 'none';
  let getPosIntervalId;
  let pPositions = [];
  let foPositions = [];
  let pMarker; // Google mapのマーカー
  let foMarker; // Google mapのマーカー

  // HTMLエレメント
  const elements = {
    id: document.getElementById('id'),
    copyBtn: document.getElementById('copyBtn'),
    connections: document.getElementById('connections'),
    status: document.getElementById('status'),
    message: document.getElementById('message'),
    idInput: document.getElementById('idInput'),
    joinBtn: document.getElementById('joinBtn'),
    controlPanel: document.getElementById('controlPanel'),
    startBtn: document.getElementById('startBtn'),
    startBtnLabel: document.getElementById('startBtnLabel')
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

    const maximumAge = 100;
    const timeout = 1000;
    const enableHighAccuracy = true;
    getPos({maximumAge, timeout, enableHighAccuracy})
      .then((rawData) => { getPosSuccess(rawData) })
      .catch((err) => { return err; });
  }

  // GPS取得成功
  function getPosSuccess(rawData) {
    const data = {
      createdAt: getTime(),
      latitude: rawData.coords.latitude,
      longitude: rawData.coords.longitude,
      altitude: rawData.coords.altitude,
      heading: rawData.coords.heading,
      accuracy: rawData.coords.accuracy,
      altitudeAccuracy: rawData.coords.altitudeAccuracy
    };

    pPositions.push({...data}); // dataの中身をコピーしてpushする（参照渡しを回避）

    // 飛行物体の最初の位置はパフォーマーの現在地を元にランダムに少しずらした座標とする
    // -1 < x <= -0.5 かつ 0.5 <= x < 1の範囲で乱数を生成
    if (pPositions.length === 1) {
      foPositions.push({...data});
      foPositions[0].latitude += .0025 * (Math.random() * .5 + .5) * Math.round(2 * Math.random() - .5);
      foPositions[0].longitude += .0025 * (Math.random() * .5 + .5) * Math.round(2 * Math.random() - .5);
    }

    // 4分(=24回)ごとに4分(=24回)前のパフォーマーの位置を飛行物体の位置として記録
    const numDelay = 4 * 60 / (getPosInterval / 1000);
    if (pPositions.length >= numDelay && pPositions.length % numDelay === 0) {
      foPositions.push(pPositions[pPositions.length - numDelay]);
    } else {
      foPositions.push(foPositions[foPositions.length - 1]);
    }

    // Mapに位置情報を反映する
    drawMap();

    send({
      pPos: pPositions(pPositions.length - 1),
      foPos: foPositions(foPositions.length - 1)
    }, 'geo');
  }

  var getPosSwitcher = () => {
    if (mode === 'sender' || mode === 'both') {
      show(elements.status, `${getTime()} 位置情報取得を開始`);
      getPosition();
      getPosIntervalId = setInterval(getPosition, getPosInterval);
    } else {
      show(elements.status, `${getTime()} 位置情報取得を停止`);
      clearInterval(getPosIntervalId);
    }
  }

  function deletePositionRecord() {
    pPositions = [];
    foPositions = [];
  }

  // ==========
  // communication
  // ==========

  function communication() {
    // ページを閉じる(更新する)時に
    window.addEventListener('beforeunload', saveConnectionsInCookie);

    elements.copyBtn.addEventListener('click', () => {
      copyTxt(peer.id);
    });
    elements.joinBtn.addEventListener('click', () => {
      join(elements.idInput.value);
      elements.idInput.value = '';
    });
    elements.startBtn.addEventListener('change', () => {
      modeChecker(getPosSwitcher);
    });

    init();
  }

  function init() {
    modeChecker();
    peer = new Peer(null);
    let reconnection = debounce(reconnect, reconnectInterval);

    peer.on('open', (id) => {
      elements.id.value = peer.id;
      elements.copyBtn.disabled = false;
      elements.joinBtn.disabled = false;
      elements.startBtn.disabled = false;
      show(elements.status, `${getTime()} 通信ができる状態になりました`);

      // 接続履歴が残っていたら再接続する
      resumeConnections();
    });

    peer.on('connection', (c) => {
      const id = c.peer;

      if (connections[id] && connections[id].open) {
        show(elements.status, `${getTime()} ${id} は接続済みです`);
        return;
      }

      connections[id] = c;
      ready(id);
    });

    // 通信回線が切断された時などに発火
    peer.on('disconnected', () => {
      show(elements.status, `${getTime()} 通信が切断されました`);

      reconnection();

      toggleCP('open');
    });

    peer.on('close', () => {
      connections = {};
      show(elements.status, `${getTime()} 通信回線が閉じました`);

      toggleCP('open');
    });

    peer.on('error', (err) => {
      // 通信エラーのIDをリストから削除する
      const errorId = err.message.split('Could not connect to peer ')[1];
      delete connections[errorId];

      show(elements.status, `${getTime()} 通信エラーが発生しました(${err.message})`);

      toggleCP('open');
    });
  }

  function join(id) {
    if (typeof id !== 'string') {
      throw new Error('Argument "id" is must a string.');
    }

    // IDが空の時は破棄する
    if (id === '') {
      delete connections[id];
      show(elements.status, `${getTime()} IDが入力されていません`);
      return;
    }

    // 自分のIDと同じIDに接続しようとした時は破棄する
    if (id === peer.id) {
      delete connections[id];
      show(elements.status, `${getTime()} ${id} には接続が許可されていません`);
      return;
    }

    // 破棄されたIDに接続しないようにする
    if (id === getCookieValueByKey('oldId')) {
      delete connections[id];
      show(elements.status, `${getTime()} ${id} は破棄されたIDです`);
      return;
    }

    // 無効な接続情報を削除する
    if (connections[id] && !connections[id].open) {
      delete connections[id];
      show(elements.status, `${getTime()} ${id} は無効な接続のため破棄します`);
    }

    // 接続済みの場合は接続を試みない
    if (connections[id] && connections[id].open) {
      show(elements.status, `${getTime()} ${id} は接続済みです`);
      return;
    }

    show(elements.status, `${getTime()} ${id} に接続を試みます`);

    connections[id] = peer.connect(id, { reliable: true });
    ready(id);
  }

  function ready(id) {
    connections[id].on('open', () => {
      show(elements.status, `${getTime()} ${id} に接続しました`);
    });

    connections[id].on('data', (data) => {
      receive(data, id);
    });

    connections[id].on('close', () => {
      delete connections[id];
      show(elements.status, `${getTime()} ${id} を切断しました`);

      toggleCP('open');
    });

    connections[id].on('error', (err) => {
      delete connections[id];
      show(elements.status, `${getTime()} ${id} に接続できなかったので破棄します(${err.message})`);

      toggleCP('open');
    });
  }

  function reconnect() {
    show(elements.status, `${getTime()} ${peer._lastServerId} に再接続を試みます`); //peer._lastServerId ?
    peer.reconnect();
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

    let message = `SENT: ${dataStringify(data)}`;
    show(elements.message, message, 'prepend');
    show(elements.status, `${getTime()} ${sendTo} に送信しました`);
  }

  function receive(data, receivedFrom) {
    if (mode === 'sender' || mode === 'none') {
      show(elements.status, `${getTime()} ${mode} モードなので受信できません`);
      return;
    }

    let message = `RECEIVED: ${dataStringify(data)}`;
    show(elements.message, message, 'prepend');
    show(elements.status, `${getTime()} ${receivedFrom} から受信しました`);

    if (data.type === 'geo') {
      // 位置情報を記録
      pPositions.push({...data.pPos});
      foPositions.push({...data.foPos});
    }
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

    beforeLatitude = x2;
    beforeLongitude = y2;

    // 角度が計算できなかったらnull
    if (!rad) {
      return null;
    }

    const deg = rad * 180 / Math.PI - 90;

    return Math.abs(deg - 360 * Math.floor(deg / 360));
  }

  // 方角を元に十六方位を返す
  function getDirection(deg) {
    if (deg === null) {
      return null;
    }

    const directions = texts.geo.direction;
    const sectionDeg = 360 / Object.keys(directions).length
    const offsetDeg = sectionDeg / 2;
    const directionNo = Math.ceil((deg + offsetDeg) / sectionDeg);
    const direction = objByIndex(directions, directionNo - 1);

    return direction;
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
    const keys = Object.keys(connections);
    for (var i = 0; i < keys.length; i++) {
      if (i === 0) {
        elements.connections.innerHTML = '';
      }
      elements.connections.innerHTML += `${keys[i]}<br>`
    }
    console.log(connections);
  }

  // テキストをコピーする
  function copyTxt(txt) {
    // 一時要素を追加
    const pre = document.createElement('pre');

    // テキストを選択可能してテキストをセット
    pre.style.webkitUserSelect = 'auto';
    pre.style.userSelect = 'auto';
    pre.textContent = txt;

    // 一時要素を追加してコピー
    document.body.appendChild(pre);
    document.getSelection().selectAllChildren(pre);
    const result = document.execCommand('copy');
    show(elements.status, `${getTime()} IDをクリップボードにコピーしました`);

    // 一時要素を削除
    document.body.removeChild(pre);

    return result;
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

  function dataStringify(data) {
    let str = '';

    if (data.type === 'geo') {
      const geoData = data.body;

      for (var i = 0; i < geoData.keys.length; i++) {
        const key = geoData.keys[i];
        const createdAt = geoData[key].createdAt;
        let heading = getHeading(beforeLatitude, beforeLongitude, geoData[key].latitude, geoData[key].longitude);
        let direction = getDirection(heading);
        const latitudeDirection = geoData[key].latitude >= 0 ? 'N' : 'S';
        const longitudeDirection = geoData[key].longitude >= 0 ? 'E' : 'W';

        heading = heading ? `${decimalize(heading, 1)}°` : 'N/A';
        direction = direction || '';
        const coordsStr = `${decimalize(geoData[key].latitude, 10)}°${latitudeDirection}, ${decimalize(geoData[key].longitude, 10)}°${longitudeDirection}`;

        if (key === 'pPos') {
          str += 'パフォーマー = '
        } else if (key === 'foPos') {
          str += '飛行物体 = '
        }
        str = `${createdAt}, 座標: ${coordsStr}, 方位: ${heading} ${direction} `;
      }
    } else {
      str = JSON.stringify(data);
    }

    return str;
  }

  function modeChecker(callback) {
    if (elements.startBtn.checked) {
      mode = 'sender';
      elements.startBtnLabel.innerHTML = 'ストップ';
    } else {
      mode = 'receiver';
      elements.startBtnLabel.innerHTML = 'スタート';
    }

    show(elements.status, `${getTime()} ${mode} モードになりました`);

    // 位置情報を削除
    deletePositionRecord();

    if (!callback) {
      return;
    }

    setTimeout(() => { callback() });
  }

  function saveConnectionsInCookie() {
    const maxAge = 60 // sec
    document.cookie = `connections=${Object.keys(connections).toString()}; oldId=${peer.id}; max-age=${maxAge}`;
  }

  function removeConnectionsInCookie() {
    const maxAge = 0 // sec
    document.cookie = `connections=; max-age=${maxAge}`;
  }

  function getCookieValueByKey(key) {
    return ((`${document.cookie};`).match(key + '=([^\S;]*)')||[])[1]||'';
  }

  function resumeConnections() {
    let arr = getCookieValueByKey('connections').split(',');
    arr = (arr.length === 1 && arr[0] === '') ? [] : arr;
    arr = arr.concat(Object.keys(connections));

    for (var i = 0; i < arr.length; i++) {
      join(arr[i]);
    }

    removeConnectionsInCookie();
  }

  // コントロールパネルを開く・閉じる・トグルする
  function toggleCP(command) {
    if (command === 'open') {
      elements.controlPanel.open = true;
    } else if (command === 'close') {
      elements.controlPanel.open = false;
    } else {
      if (elements.controlPanel.open) {
        elements.controlPanel.open = false;
      } else {
        elements.controlPanel.open = true;
      }
    }
  }

  function drawMap() {
    // 古いマーカーを削除
    if (pMarker) {
      pMarker.setMap(null);
    }
    if (foMarker) {
      foMarker.setMap(null);
    }

    // マーカーを設置
    pMarker = new google.maps.Marker({
      position: {
        lat: pPositions[pPositions.length - 1].latitude,
        lng: pPositions[pPositions.length - 1].longitude
      },
      label: {
        text: "‍‍‍🚶",
        fontSize: "64px"
      },
      title: "Performer"
    });
    foMarker = new google.maps.Marker({
      position: {
        lat: foPositions[foPositions.length - 1].latitude,
        lng: foPositions[foPositions.length - 1].longitude
      },
      label: {
        text: "🛸",
        fontSize: "64px"
      },
      title: "Fling Object"
    });
    pMarker.setMap(map);
    foMarker.setMap(map);

    // マーカーの位置に合わせて地図の中心位置とズーム倍率を最適化
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(pMarker.position);
    bounds.extend(foMarker.position);
    map.fitBounds(bounds, 100);

    // ズームしすぎな時は適度に引く
    if (map.getZoom() > 18) {
      map.setZoom(18);
    }
  }

  // ==========
  // execute
  // ==========
  communication();
}

window.addEventListener('DOMContentLoaded', () => {
  poscom();
});
