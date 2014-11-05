var EasyVideoCall = {
  setVars: function(){
    video_call = $("#video_call").data("video-call");
    is_performer = $("#is_performer").data("is-performer");
    callback_url = $("#callback_url").data("callback-url");
    api_key = $("#api_key").data("api-key");
    my_room_name = $("#room_name").data("room-name");
  },
  appInit: function(){

    easyrtc.joinRoom(my_room_name, {
      roomDefaultEnable: false,
      roomAutoCreateEnable: false
    }, null, null);

    easyrtc.setRoomOccupantListener(this.callEverybodyElse);
    easyrtc.dontAddCloseButtons(true);
    easyrtc.easyApp("roomDemo", "box0", ["box1"], function(){});
    easyrtc.setPeerListener(function(){});
    easyrtc.setDisconnectListener( function() {
      alertify.error("Lost connection");
    });
    easyrtc.setOnCall( function(easyrtcid, slot) {
      var _this = this;
      $.post('/api/v1/video_calls/set_start_time', {
        video_call: video_call,
        api_key: api_key
      }, function(res){
        start_time = res.start_time * 1000;
        EasyClock.startClock(res.duration);
      });
    });
  },
  killActiveBox: function(status){
    var easyrtcid = $("#box1").data("caller");
    var _this = this;

    setTimeout( function() {
      easyrtc.hangup(easyrtcid);
      _this.finishCall(status);
    }, 400);
  },
  finishCall: function(status){
    var duration = $("#clock").text();
    $.post('/api/v1/video_calls/'+video_call, {
      "_method": "delete",
      status: status,
      api_key: api_key,
      duration: duration
    }, function(){
      alertify.success("Session Ended");
      setTimeout(function() {
        window.location.href = callback_url + "?role=performer" + "&video_call=" + video_call + "&status=" + status.replace("!", "");
      }, 1500);
    });
  },
  callEverybodyElse: function(roomName, otherPeople){
    easyrtc.setRoomOccupantListener(null); // so we're only called once.

    var list = [];
    var connectCount = 0;

    for(var easyrtcid in otherPeople ) {
      list.push(easyrtcid);
    }

    function establishConnection(position) {
      function callSuccess() {
        connectCount++;
        if( connectCount < 2 && position > 0) {
          establishConnection(position-1);
        }
      }
      function callFailure(errorCode, errorText) {
        easyrtc.showError(errorCode, errorText);
        if( connectCount < 2 && position > 0) {
          establishConnection(position-1);
        }
      }
      easyrtc.call(list[position], callSuccess, callFailure);

    }
    if( list.length > 0) {
      establishConnection(list.length-1);
    }
  },
  handleFullScreen: function(elemId){
    var elem = document.getElementById(elemId);
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }
  }
};

var EasyClock = {
  startClock: function(duration){
    var countdown_time = start_time + (parseFloat(duration) * 60 * 1000);
    var clock = $("#clock");

    clock.countdown(countdown_time);
    clock.on('update.countdown', function(event) {
      var format = '%H:%M:%S';
      $(this).html(event.strftime(format));
    }).on('finish.countdown', function(event) {
      if(is_performer)
        EasyVideoCall.killActiveBox("success!");
    });
  },
  extendTime: function(minutes_to_add){
    if(!isNaN(minutes_to_add)){
      $.post('/api/v1/video_calls/set_extended_time', {
        extended_time: minutes_to_add,
        video_call: video_call,
        api_key: api_key
      }, function(res){
        var countdown_time = res.start_time * 1000 + parseFloat(res.duration) * 60 * 1000;
        $("#clock").countdown(countdown_time);
        $("#minutes").val("");
        $("#extend").hide();
        alertify.success("Added "+minutes_to_add+" minute(s)");
      });
    } else{
      alertify.error("Please enter a valid number");
    }
  }
};

var EasyNotify = {
  bindForSocket: function(){
    if(!is_performer){
      socket.on("customer-channel-"+video_call, function(message){
        if(message.action=='extended'){
          var countdown_time = start_time + parseFloat(message.message) * 60 * 1000;
          $("#clock").countdown(countdown_time);
          alertify.success("Video call successfully extended");
        }
        else{
          alertify.success("Session Ended");
          setTimeout(function() {
            window.location.href = callback_url + "?role=customer" + "&video_call=" + video_call + "&status=" + message.action.replace("!", "");
          }, 1500);
        }
      });
    }
    socket.on("lost-channel-"+video_call, function(message){
      if(message.action=='lost'){
        alertify.success("Video call lost");
        $('#clock').countdown('pause');
        setTimeout(function() {
          location.reload(true);
        }, 1500);
      }
    });
  }
};

(function(){
  var start_time, is_performer,
  video_call, callback_url,
  api_key, my_room_name;
})();

$(document).ready(function(){

  if($("#box0").length > 0){
    EasyVideoCall.setVars();
    EasyVideoCall.appInit();
    EasyNotify.bindForSocket();
  }

  $("#full_screen").click(function(){
    EasyVideoCall.handleFullScreen("subscriberPlayer");
  });

  $("#decline").click(function(){
    alertify.confirm("Do you want to terminate this session?", function (e) {
      if(e) EasyVideoCall.killActiveBox("terminated!");
    });
  });

  $("#extend").click(function(){
      alertify.confirm("Do you want to extend the session for 1 minute?", function (e) {
        if (e)
          EasyClock.extendTime(1);
        else
          $("#minutes").val("");
      });
  });
});

$(window).bind("beforeunload", function() {
  var duration = $("#clock").text(),
  url = '/api/v1/video_calls/lost',
  data = { api_key: api_key, duration: duration, id: video_call };
  if (duration) {
    console.log("Unloadding");
    $.ajax({
      type: 'POST',
      url: url,
      data: data,
      async:false
    });
  }

});
