位置情報
  gpsの取得

通信系
  データの送信
  データの受信
  途絶時のリトライ（前回の通信相手）

ユーティリティ
  時刻取得
  方角算出
  十六方位
  有効数字
  ゼロつける
  テキストの表示（受信データ、ステータス、通信相手）
  テキストコピー

1. 接続(自分のIDを送る)
2. 応答(自分のIDを送る)

data
  head
    sentFrom: string // peer id
    sentAt: string // time
    type: string // geo, status
  body
    ...

  function init() {
    peer = new Peer(null, { debug: 2 });
    peer.on('open', (id) => {
      if (peer.id === null) {
        peer.id = lastPeerId;
      } else {
        lastPeerId = peer.id;
      }
      showId(peer.id);
      showStatus(text.status.wating);
    });
    peer.on('connection', (c) => {
      for (var i = 0; i < connArr.length; i++) {
        if (connArr[i].peer === c.peer) {
          c.on('open', () => { c.close() });
          return;
        }
      }
      connArr.push(c);
      showStatus(text.status.connect(c.peer));
      showPeer();
      ready(connArr.length - 1);
      geoLocation();
      setInterval(geoLocation, interval);
    });
    peer.on('disconnected', () => {
      showStatus(text.status.disconnect);
      peer.id = lastPeerId;
      peer._lastServerId = lastPeerId;
      peer.reconnect();
    });
    peer.on('close', () => {
      showStatus(text.status.close);
      connArr = [];
      showPeer();
    });
    peer.on('error', (err) => {
      showStatus(text.status.error(err));
    });
  }

  function ready() {
    connArr[i].on('data', (data) => {
      showMessage(data);
    });
    connArr[i].on('close', () => {
      showStatus(texts.status.close);
      connArr.splice(connArr.length - 1, 1); // イベント登録時と発動時のconnArrのlengthの違いに注意
      showPeer();
    });
    connArr[i].on('error', (err) => {
      showStatus(texts.status.error(err));
    });
  }

  function join() {
    connArr.push(peer.connect(idInputEl.value, { reliable: true }));
    var index = connArr.length - 1;

    connArr[index].on('open', () => {
      showStatus(texts.status.connect(connArr[index].peer));
      showPeer();
    });
    connArr[index].on('data', (data) => {
      showMessage(data);
    });
    connArr[index].on('close', () => {
      showStatus(texts.status.closeConn(connArr[index].peer));
      connArr.splice(index, 1);
      showPeer();
    });
  }
