// TODO:
// herokuにアップロード（丸山さんや木村さんもテストできるようになります）
// ステータス表示のバグ修正
// 方角を角度と併せて、十六方位（南南西、とか）も表示する
// iPhoneの画面を消しても通信を続ける（可能なら）
// もうちょっと使いやすい工夫・見せ方

document.addEventListener('DOMContentLoaded', () => {
  // const interval = 4 * 60 * 1000; // minutes x seconds x 100 ms
  const interval = 10000;
  let beforeLatitude, beforeLongitude = null;
  let connArr = [];
  const idEl = document.getElementById('id');
  const copyBtn = document.getElementById('copy');
  const peerEl = document.getElementById('peer');
  const statusEl = document.getElementById('status');
  const messageEl = document.getElementById('message');
  const idInputEl = document.getElementById('idInput');
  const joinBtn = document.getElementById("join");
  const text = {
    status: {
      connect: (id) => {
        return `「${id}」に接続しました`;
      },
      disconnect: "シグナリングサーバから切断されました",
      close: "接続を切断しました",
      closeConn: (id) => {
        return `「${id}」との接続が切断されました`
      },
      error: (err) => {
        return `エラーが発生しました: ${err}`
      },
      noConnect: "誰とも接続していません",
      wating: "接続を待っています...",
      reset: `接続をリセットしました`
    },
    message: {
      receive: (data) => {
        return `相手: ${data}`
      },
      send: (data) => {
        return `自分: ${data}`
      }
    },
    geo: {
      error: (err) => {
        return `ロケーションを取得できませんでした(${err})`
      },
      noSupported: "geolocation非対応ブラウザです",
      processing: "位置情報を取得中...",
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
      },
      na: "N/A"
    }
  }

  function geoLocation() {
    function success(pos) {
      let latitude = pos.coords.latitude;
      let longitude = pos.coords.longitude;
      let altitude = pos.coords.altitude;
      // let heading = pos.coords.heading;
      let heading = getHeading(beforeLatitude, beforeLongitude, latitude, longitude);
      let direction = getDirection(heading);
      // let accuracy = pos.coords.accuracy;
      // let altitudeAccuracy = pos.coords.altitudeAccuracy;

      latitude = `${fixDecimal(latitude, 10) || text.geo.na}°`;
      latitude += latitude >= 0 ? 'N' : 'S';
      longitude = `${fixDecimal(longitude, 10) || text.geo.na}°`;
      longitude += longitude >= 0 ? 'E' : 'W';
      altitude = `${fixDecimal(altitude, 10) ? fixDecimal(altitude, 10) + 'm' : text.geo.na}`;
      heading = heading ? `(${fixDecimal(heading, 1)}°)` : '';
      direction = direction || text.geo.na;

      send(`${getTime()}, 座標: ${latitude}, ${longitude}, 高度: ${altitude}, 方位: ${direction} ${heading}`);
    }

    function error(err) {
      text.geo.noSupported(text.geo.error(err))
    }

    function getTime() {
      const now = new Date();
      const year = now.getFullYear();
      const month = numDigitalize(now.getMonth() + 1);
      const day = numDigitalize(now.getDate());
      const hour = numDigitalize(now.getHours());
      const minute = numDigitalize(now.getMinutes());
      const second = numDigitalize(now.getSeconds());
      let time = `${year}/${month}/${day} ${hour}:${minute}:${second}`;
      return time;
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

    function getDirection(deg) {
      if (!deg) {
        return null; // 角度が計算できない時は方位も求めない
      }

      const sectionDeg = 360 / 16;
      const offset = sectionDeg / 2;
      // 0度が方位「北」の区間の中央を指すように区間の1/2オフセットする。
      const degOffset = deg + offset;
      let direction;

      if (0 <= degOffset && degOffset < sectionDeg * 1) {
        direction = text.geo.direction.n;
      } else if (sectionDeg * 1 <= degOffset && degOffset < sectionDeg * 2) {
        direction = text.geo.direction.nne;
      } else if (sectionDeg * 2 <= degOffset && degOffset < sectionDeg * 3) {
        direction = text.geo.direction.ne;
      } else if (sectionDeg * 3 <= degOffset && degOffset < sectionDeg * 4) {
        direction = text.geo.direction.ene;
      } else if (sectionDeg * 4 <= degOffset && degOffset < sectionDeg * 5) {
        direction = text.geo.direction.e;
      } else if (sectionDeg * 5 <= degOffset && degOffset < sectionDeg * 6) {
        direction = text.geo.direction.ese;
      } else if (sectionDeg * 6 <= degOffset && degOffset < sectionDeg * 7) {
        direction = text.geo.direction.se;
      } else if (sectionDeg * 7 <= degOffset && degOffset < sectionDeg * 8) {
        direction = text.geo.direction.sse;
      } else if (sectionDeg * 8 <= degOffset && degOffset < sectionDeg * 9) {
        direction = text.geo.direction.s;
      } else if (sectionDeg * 9 <= degOffset && degOffset < sectionDeg * 10) {
        direction = text.geo.direction.ssw;
      } else if (sectionDeg * 10 <= degOffset && degOffset < sectionDeg * 11) {
        direction = text.geo.direction.sw;
      } else if (sectionDeg * 11 <= degOffset && degOffset < sectionDeg * 12) {
        direction = text.geo.direction.wsw;
      } else if (sectionDeg * 12 <= degOffset && degOffset < sectionDeg * 13) {
        direction = text.geo.direction.w;
      } else if (sectionDeg * 13 <= degOffset && degOffset < sectionDeg * 14) {
        direction = text.geo.direction.wnw;
      } else if (sectionDeg * 14 <= degOffset && degOffset < sectionDeg * 15) {
        direction = text.geo.direction.nw;
      } else if (sectionDeg * 15 <= degOffset && degOffset < sectionDeg * 16) {
        direction = text.geo.direction.nnw;
      } else {
        direction = null;
      }

      return direction;
    }

    // 有効数字の桁数を揃える(元の値, 桁数)
    function fixDecimal(val, num) {
      if (typeof val === 'number') {
        return val.toFixed(num);
      }
      return val;
    }

    // 一桁の数字の頭にゼロをつける
    function numDigitalize(num) {
      if (num < 10) {
        return `0${num}`
      }
      return num;
    }

    if (!navigator.geolocation) {
      showStatus(text.geo.noSupported)
    } else {
      navigator.geolocation.getCurrentPosition(success, error);
    }
  }

  function multiConnection () {
    let lastPeerId = null;
    let peer = null;

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

    function ready(i) {
      connArr[i].on('data', (data) => {
        showMessage(text.message.receive(data));
      });
      connArr[i].on('close', () => {
        showStatus(text.status.close);
        connArr.splice(connArr.length - 1, 1); // イベント登録時と発動時のconnArrのlengthの違いに注意
        showPeer();
      });
      connArr[i].on('error', (err) => {
        showStatus(text.status.error(err));
      });
    }

    function join() {
      connArr.push(peer.connect(idInputEl.value, { reliable: true }));
      var index = connArr.length - 1;

      connArr[index].on('open', () => {
        showStatus(text.status.connect(connArr[index].peer));
        showPeer();
      });
      connArr[index].on('data', (data) => {
        showMessage(text.message.receive(data));
      });
      connArr[index].on('close', () => {
        showStatus(text.status.closeConn(connArr[index].peer));
        connArr.splice(index, 1);
        showPeer();
      });
    }

    function showId(t) {
      idEl.value = t;
    }

    function showPeer() {
      var txt = "";
      for (var i = 0; i < connArr.length; i++) {
        txt += connArr[i].peer + "<br>";
      }
      peerEl.innerHTML = txt;
    }

    joinBtn.addEventListener('click', join);

    copyBtn.addEventListener('click', () => {
      idEl.select();
      document.execCommand('copy');
    });

    init();
  }

  function showStatus(t) {
    statusEl.innerHTML = t;
  }

  function showMessage(t) {
    messageEl.innerHTML = t + "<br>" + message.innerHTML;
  }

  function send(msg) {
    if (connArr.length > 0) {
      for (var i = 0; i < connArr.length; i++) {
        connArr[i].send(msg);
      }
      showMessage(text.message.send(msg));
    } else {
      showStatus(text.status.noConnect);
    }
  }

  multiConnection();

});
