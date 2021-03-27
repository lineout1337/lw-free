var url = "http://localhost:18000/";
var devices;
var devices_count = 0;
var refresh_time = 2000;
var first_time = true;
var devices_indices = new Array();
var log_lines = new Array();
var log_index = 0;
var MAX_LOG_SIZE = 200;
var last_update_failed = false;
var tick_handler = null;
var selected_devices = new Array();
var session_id = null;
var session_missmatch_count = 0;
var uvolt_unlocked = false;
var uvolt_unlocked2 = false;


var GDDR6MemoryClockRange = [5800, 8800];
var GDDR6XMemoryClockRange3080 = [8250, 11250];
var GDDR6XMemoryClockRange3090 = [8500, 11500];


function start_code() {

    session_id = gen_random_str();

    clear_logs();
    log_write('normal', 'Starting up...');

    _tick();
}


var rg_alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
function gen_random_str() {
    var gen_str = '';
    var c_count = rg_alphabet.length;
    for (var i = 0; i < 16; ++i)
        gen_str += rg_alphabet[Math.floor(Math.random() * c_count)];

    return gen_str;
}


function log_write(t, s) {

    //if (first_time) return;

    var d = new Date();
    var str = '<span class="log-class-' + t + '">[' + d.toLocaleString() + '] ';
    str += s + '</span>';
    log_lines[log_index] = str;
    var start = log_index;
    log_index = (log_index + 1) % MAX_LOG_SIZE;
    var end = log_index;

    // print whole log now
    var all = '';
    var i = 0;
    while (start !== end) {
        all += log_lines[start];
        if (start === 0) start = MAX_LOG_SIZE - 1;
        else --start;
    }

    $('#log-view-div').html(all);
}


function clear_logs() {
    log_lines = new Array();
    log_index = 0;
    $('#log-view-div').html('');
    for (var i = 0; i < MAX_LOG_SIZE; ++i)
        log_lines[i] = '';
}


function _tick() {
    var rf_time = 10000;
    if (!last_update_failed) rf_time = refresh_time + 13;
    tick_handler = setTimeout(_tick, rf_time);
    updateAll();
}


function allow_uvolt(enable) {
    if (enable != null)
        uvolt_unlocked = enable;
    else
        uvolt_unlocked = !uvolt_unlocked;
    $('#selected-core-volt').attr('disabled', !uvolt_unlocked);
    $('#core-uvolt').prop('checked', uvolt_unlocked);

    if (uvolt_unlocked) {
        var dev_id = $('#selected-device').val();
        var dd = devices[dev_id];
        var device_ocs = devices[dev_id].oc_data;
        if (device_ocs.core_uvolt.length > 0 &&
            device_ocs.core_uvolt[0].clock != undefined) {
            $('#selected-core-volt').val(device_ocs.core_uvolt[0].mV);
        }
    }
}


function allow_uvolt2(enable) {

    var dev_id = $('#selected-device').val();
    var dd = devices[dev_id];
    var device_ocs = devices[dev_id].oc_data;
    $('#selected-core').val(device_ocs.core_clock_delta);

    if (enable != null)
        uvolt_unlocked2 = enable;
    else
        uvolt_unlocked2 = !uvolt_unlocked2;

    $('#selected-core-volt2').attr('disabled', !uvolt_unlocked2);
    $('#core-uvolt2').prop('checked', uvolt_unlocked2);

    if (uvolt_unlocked2) {
        $('#core-delta-text').html('Max core clock: ');
        $('#core-delta-limits').hide();
        $('#core-max-limits').show();
        if (device_ocs.core_uvolt.length > 0 &&
            device_ocs.core_uvolt[0].max_clock != undefined) {
            $('#selected-core').val(device_ocs.core_uvolt[0].max_clock);
            $('#selected-core-volt2').val(device_ocs.core_uvolt[0].max_mV);
        }
        else if (device_ocs.core_clock_delta < 510)
            $('#selected-core').val('510');
    }
    else {
        $('#core-delta-text').html('Core clock delta: ');
        $('#core-delta-limits').show();
        $('#core-max-limits').hide();
    }
}

//function check_multiple_tabs(psid) {
//    if (psid == null) return;

//    if (psid === session_id) return;

//    ++session_missmatch_count;
//    if (session_missmatch_count >= 4) {
//        alert('Multiple open OCTune TABS detected! Please, use only one to improve performance of your mining!');
//        session_missmatch_count = 0;
//    }
//}


function updateAll() {
    $.ajax({
        url: url + "devices_cuda",
        /*beforeSend: function (xhr) {
            xhr.setRequestHeader('OCTune-ID', session_id);
        },*/
        //headers: { 'OCTune-ID': session_id },
        success: function (data, textS, request) {

            var reconn = last_update_failed;
            last_update_failed = false;

            if (data.error !== null) {
                log_write('error', 'Failed to get cuda devices');
                return;
            }

            //check_multiple_tabs(request.getResponseHeader('OCTune-ID-Previous'));

            devices = data.devices;
            devices_count = data.devices.length;
            for (var i = 0; i < devices.length; ++i) {
                var dd = devices[i];
                if (dd.name === "GeForce RTX 3080")
                    dd.GDDRData = GDDR6XMemoryClockRange3080;
                else if (dd.name === "GeForce RTX 3090")
                    dd.GDDRData = GDDR6XMemoryClockRange3090;
                else if (parseInt(dd.details.sm_major) >= 7)
                    dd.GDDRData = GDDR6MemoryClockRange;
                else
                    dd.GDDRData = null;
            }

            if (first_time) {
                first_time = false;

                //get_current_credentials();

                // build table first time
                var disp_health = '';
                var disp = '';
                for (var i = 0; i < devices_count; ++i) {
                    var k = devices[i].device_id;
                    devices_indices[k] = i;
                    disp += '<tr><td>' + k + '</td>';
                    disp += '<td>' + devices[i].name + '</td>';
                    disp += '<td id="device-' + k + '-kt-min"></td>';
                    disp += '<td id="device-' + k + '-kt-avg"></td>';
                    disp += '<td id="device-' + k + '-kt-umed"></td>';
                    disp += '<td id="device-' + k + '-hwerr"></td>';
                    disp += '<td id="device-' + k + '-hwok"></td>';

                    disp += '<td id="device-' + k + '-oc-core"></td>';
                    disp += '<td id="device-' + k + '-oc-mem"></td>';
                    disp += '<td id="device-' + k + '-oc-pwr"></td>';
                    disp += '<td id="device-' + k + '-oc-tdp"></td>';

                    disp += '<td id="device-' + k + '-power"></td>';

                    disp += '<td id="device-' + k + '-speed"></td>';
                    disp += '<th id="device-' + k + '-eff"></th>';
                    disp += '</tr>';

                    $('#selected-device').append($('<option>', {
                        value: k,
                        text: k + '. ' + devices[i].name
                    }));

                    disp_health += '<tr><td>' + k + '</td>';
                    disp_health += '<td>' + devices[i].name + '</td>';
                    disp_health += '<td id="device-' + k + '-temp"></td>';
                    disp_health += '<td id="device-' + k + '-fan-rpm"></td>';
                    disp_health += '<td id="device-' + k + '-fan-perc"></td>';
                    disp_health += '<td id="device-' + k + '-fan-data"></td>';
                    disp_health += '<td id="device-' + k + '-clock-core"></td>';
                    disp_health += '<td id="device-' + k + '-oc-core-limit"></td>';
                    disp_health += '<td id="device-' + k + '-volt-core"></td>';
                    disp_health += '<td id="device-' + k + '-clock-mem"></td>';
                    disp_health += '<td><input type="checkbox" id="device-' + k + '-selected" class="auto-tune-disable"></td>';
                    disp_health += '</tr>';
                }
                $('#table-main-oc').html(disp);
                $('#table-main-health').html(disp_health);

                pre_oc_fill();
            }

            if (reconn) pre_oc_fill();

            for (var i = 0; i < devices.length; ++i) {
                devices[i].oc_data.power_limit_watts = Math.floor(devices[i].oc_data.power_limit_watts);
                var dd = devices[i];
                var k = dd.device_id;
                $('#device-' + k + '-id').html(dd.device_id);
                $('#device-' + k + '-name').html(dd.name);

                if (dd.fans.length > 0) {
                    var rpm_text = '';
                    var level_text = '';
                    for (var d = 0; d < dd.fans.length; ++d) {
                        var fan = dd.fans[d];
                        if (d > 0) {
                            rpm_text += ' <br/>';
                            level_text += ' %<br/>';
                        }
                        rpm_text += fan.current_rpm;
                        level_text += fan.current_level;
                    }
                    level_text += ' %';
                    $('#device-' + k + '-fan-rpm').html(rpm_text);
                    $('#device-' + k + '-fan-perc').html(level_text);
                    dd.gpu_fan_speed = dd.fans[0].current_level;
                }
                else {
                    $('#device-' + k + '-fan-rpm').html(dd.gpu_fan_speed_rpm);
                    $('#device-' + k + '-fan-perc').html(dd.gpu_fan_speed + ' %');
                }

                
                $('#fan-level-' + k).val(dd.gpu_fan_speed);

                if (dd.kernel_times.min > 0)
                    $('#device-' + k + '-kt-min').html(dd.kernel_times.min);
                if (dd.kernel_times.umed > 0)
                    $('#device-' + k + '-kt-umed').html(dd.kernel_times.umed);
                if (dd.kernel_times.avg > 0)
                    $('#device-' + k + '-kt-avg').html(dd.kernel_times.avg);
                $('#device-' + k + '-hwerr').html(dd.hw_errors);
                $('#device-' + k + '-hwok').html(dd.hw_errors_success);

                var uvolt_text = dd.gpu_mvolt_core;
                if (dd.oc_data.core_uvolt != undefined &&
                    dd.oc_data.core_uvolt != null &&
                    dd.oc_data.core_uvolt.length > 0) {
                    uvolt_text += '<br /><small>';
                    if (dd.oc_data.core_uvolt[0].max_mV != undefined) {
                        uvolt_text += 'Max: ' + dd.oc_data.core_uvolt[0].max_clock + ' @ ';
                        uvolt_text += dd.oc_data.core_uvolt[0].max_mV + 'mV';
                    }
                    else {
                        uvolt_text += dd.oc_data.core_uvolt[0].clock + ' @ -';
                        uvolt_text += dd.oc_data.core_uvolt[0].mV + 'mV';
                    }
                    uvolt_text += '</small>';
                }
                $('#device-' + k + '-volt-core').html(uvolt_text);
                $('#device-' + k + '-clock-core').html(dd.gpu_clock_core);
                $('#device-' + k + '-clock-mem').html(dd.gpu_clock_memory);

                $('#device-' + k + '-oc-core').html(dd.oc_data.core_clock_delta);
                $('#device-' + k + '-oc-mem').html(dd.oc_data.memory_clock_delta);
                $('#device-' + k + '-oc-core-limit').html(dd.oc_data.core_clock_limit);
                $('#device-' + k + '-oc-pwr').html(dd.oc_data.power_limit_watts);
                $('#device-' + k + '-oc-tdp').html(dd.oc_data.power_limit_tdp);

                if (dd.gpu_power_usage != null)
                    $('#device-' + k + '-power').html(dd.gpu_power_usage.toFixed(2));
                else
                    $('#device-' + k + '-power').html('N/A');

                var temp_dsp = 'GPU: <span class="'; 
                var int_temp = parseInt(dd.gpu_temp);
                if (int_temp > 85)
                    temp_dsp += 'temp-mem-high';
                else if (int_temp > 75)
                    temp_dsp += 'temp-mem-med';
                else
                    temp_dsp += 'temp-mem-low';
                temp_dsp += '">' + dd.gpu_temp + '</span>';

                if (dd.__gddr6x_temp != undefined) {
                    temp_dsp += '<br />VRAM: <span class="';
                    int_temp = parseInt(dd.__gddr6x_temp);
                    if (int_temp > 105)
                        temp_dsp += 'temp-mem-high';
                    else if (int_temp > 95)
                        temp_dsp += 'temp-mem-med';
                    else
                        temp_dsp += 'temp-mem-low';

                    if (int_temp >= 110) {
                        log_write('warning', 'WARNING! Device #' + k + ' video card memory is OVERHEATING! Temperature: ' + int_temp + ' &#8451;');
                    }
                    temp_dsp += '">' + dd.__gddr6x_temp + '</span>';
                }
                else if (dd.__hotspot_temp != undefined) {
                    temp_dsp += '<br />HotSpot: <span class="';
                    int_temp = parseInt(dd.__hotspot_temp);
                    if (int_temp > 95)
                        temp_dsp += 'temp-mem-high';
                    else if (int_temp > 85)
                        temp_dsp += 'temp-mem-med';
                    else
                        temp_dsp += 'temp-mem-low';

                    temp_dsp += '">' + dd.__hotspot_temp + '</span>';
                }

                $('#device-' + k + '-temp').html(temp_dsp);

                var fanset_dsp = 'Fan mode: ';
                fanset_dsp += $('#selected-fan-mode-' + dd.smartfan.mode).html();
                if (dd.smartfan.mode === 1) fanset_dsp += '<br />Fixed speed: ' + dd.smartfan.fixed_speed + ' %';
                else if (dd.smartfan.mode === 2 ||
                    dd.smartfan.mode === 3)
                    fanset_dsp += '<br />Target GPU T.: ' + dd.smartfan.target_gpu +
                        ' &#8451; Target VRAM T.: ' + dd.smartfan.target_vram + ' &#8451;';
                $('#device-' + k + '-fan-data').html(fanset_dsp);
            }

            $.ajax({
                url: url + "workers",
                success: function (data) {
                    if (data.error !== null) return;

                    for (var i = 0; i < devices.length; ++i)
                        devices[i].speed = 0;

                    for (var i = 0; i < data.workers.length; ++i) {
                        var dev_id = data.workers[i].device_id;
                        var speed = data.workers[i].algorithms[0].speed / 1000000;
                        devices[dev_id].speed = speed;
                        var th_per_ke_str = data.workers[i].params_used; // "B=21888,TPB=64,S=2,KT=2"
                        var ssplit = th_per_ke_str.split(",");
                        var _blocks = 1;
                        var _tpb = 1;
                        var _streams = 1;
                        for (var t = 0; t < ssplit.length; ++t) {
                            var ssplit2 = ssplit[t].split("=");
                            if (ssplit2[0] === "B")
                                _blocks = parseInt(ssplit2[1]);
                            else if (ssplit2[0] === "TPB")
                                _tpb = parseInt(ssplit2[1]);
                            else if (ssplit2[0] === "S")
                                _streams = parseInt(ssplit2[1]);
                        }
                        devices[dev_id].hashes_per_ke = _blocks * _tpb * _streams;
                    }

                    for (var i = 0; i < devices.length; ++i) {
                        var dev_id = devices[i].device_id;
                        $('#device-' + dev_id + '-speed').html(devices[i].speed.toFixed(2));
                        if (devices[i].gpu_power_usage != null && devices[i].gpu_power_usage > 0) {
                            devices[i].eff = devices[i].speed * 1000 / devices[i].gpu_power_usage;
                            $('#device-' + dev_id + '-eff').html((devices[i].eff).toFixed(2));
                        }
                    }

                    // update totals
                    var t_speed = 0;
                    var t_power = 0;
                    for (var i = 0; i < devices_count; ++i) {
                        if (devices[i].gpu_power_usage != null) {
                            t_speed += devices[i].speed;
                            t_power += devices[i].gpu_power_usage;
                        }
                    }

                    $('#total-speed').html(t_speed.toFixed(2));
                    $('#total-power').html(t_power.toFixed(2));
                    if (t_power > 0)
                        $('#total-eff').html((t_speed * 1000 / t_power).toFixed(2));
                },
                error: function (data) {
                    log_write('error', 'Cannot connect: /workers');
                }
            });

        }, error: function () {
            log_write('error', 'Cannot connect: /cuda_devices');
            last_update_failed = true;
        }
    });
}


function apply_fan(dev_id) {
    if (dev_id == null)
        dev_id = $('#selected-device').val();
    var fan_mode = $('#selected-fan-mode').val();
    var fan_speed = $('#selected-fan-speed').val();
    var fan_temp_gpu = $('#selected-fan-temp-gpu').val();
    var fan_temp_vram = $('#selected-fan-temp-vram').val();

    var strurl;
    if (fan_mode === '1') {
        strurl = url + 'fanset?id=' + dev_id + '&level=' + fan_speed;
        log_write('normal', 'Applying FAN device #' + dev_id + ' fixed speed=' + fan_speed);
    }
    else {
        strurl = url + 'smartfanset?id=' + dev_id + '&mode=' + fan_mode;
        if (fan_mode !== '0') {
            strurl += '&gputarg=' + fan_temp_gpu + '&vramtarg=' + fan_temp_vram;
            log_write('normal', 'Applying FAN device #' + dev_id + ' mode=' + fan_mode + ' GPU target=' + fan_temp_gpu + ' VRAM target='  + fan_temp_vram);
        }
        else {
            log_write('normal', 'Applying FAN device #' + dev_id + ' reset to default/auto');
        }
    }

    $.ajax({
        url: strurl,
        success: function (data) {
            if (data.error !== null) {
                log_write('normal', 'Failed to apply FAN');
            }
            else {
                log_write('normal', 'Applied FAN successfully');
            }
        },
        error: function () { }
    });
}


function force_clean_all() {

    if (!confirm('Are you sure you want to remove all fan&overclocks and reset all devices to stock settings?')) {
        return;
    }

    log_write('normal', 'Resetting OCs and FANs for all devices');

    for (var i = 0; i < devices.length; ++i) {
        $.ajax({
            url: url + 'fanreset?id=' + devices[i].device_id,
            indexValue: devices[i].device_id,
            success: function (data, indexValue) {
                if (data.error !== null) {
                    log_write('normal', 'Failed to reset FAN for device #' + this.indexValue);
                }
                else {
                    log_write('normal', 'FAN reset for device #' + this.indexValue);
                }
            }
        });
    }

    for (var i = 0; i < devices.length; ++i) {
        $.ajax({
            url: url + "resetoc?id=" + devices[i].device_id + "&clean=1",
            indexValue: devices[i].device_id,
            success: function (data, indexValue) {
                if (data.error !== null) {
                    // handle err case
                }
                else {
                     log_write('normal', 'Reset OC (clean) successfully for device #' + this.indexValue);
                }
            }
        });
    }
}


function apply_fan_all() {

    var fan_mode = $('#selected-fan-mode').val();
    var fan_speed = $('#selected-fan-speed').val();
    var fan_temp_gpu = $('#selected-fan-temp-gpu').val();
    var fan_temp_vram = $('#selected-fan-temp-vram').val();

    var strurl = url + 'fanset?id=';
    var endurl = '';
    if (fan_mode === '1') {
        endurl = '&level=' + fan_speed;
        log_write('normal', 'Applying FAN for all: fixed speed=' + fan_speed);
    }
    else {
        strurl = url + 'smartfanset?id=';
        endurl = '&mode=' + fan_mode;
        if (fan_mode !== '0') {
            endurl += '&gputarg=' + fan_temp_gpu + '&vramtarg=' + fan_temp_vram;
            log_write('normal', 'Applying FAN for all: mode=' + fan_mode + ' GPU target=' + fan_temp_gpu + ' VRAM target=' + fan_temp_vram);
        }
        else {
            log_write('normal', 'Applying FAN for all: reset to default/auto');
        }
    }

    for (var i = 0; i < devices.length; ++i) {
        $.ajax({
            url: strurl + devices[i].device_id + endurl,
            indexValue: devices[i].device_id,
            success: function (data, indexValue) {
                if (data.error !== null) {
                    log_write('normal', 'Failed to apply FAN for device #' + this.indexValue);
                }
                else {
                    log_write('normal', 'Applied FAN successfully for device #' + this.indexValue);
                }
            }
        });
    }
}


function apply_oc_alt(dev_id) {
    if (dev_id == null)
        dev_id = $('#selected-device').val();

    var dindex = devices_indices[dev_id];
    if (devices[dindex].details.sm_major === 6) {
        log_write('normal', 'Device #' + dev_id + ': Cannot perform for GPU arch: Pascal');
        return;
    }

    var core_max = $('#selected-core-max').val();
    var memory = $('#selected-memory-abs').val();
    var mv_opt = parseInt($('#selected-core-volt').val());
    if (!uvolt_unlocked || isNaN(mv_opt)) mv_opt = null;
    else if (mv_opt < 0) mv_opt = -mv_opt;

    var strurl = url + 'setocprofile2?id=' + dev_id + '&core=' + core_max + '&memory=' + memory;
    log_write('normal', 'Applying OC (alt) dev=' + dev_id + ' max core=' + core_max + ' memory=' + memory);

    if (mv_opt != null) {
        strurl += '&uvolt=' + mv_opt;
        log_write('normal', 'Applying undervolt: ' + mv_opt + ' mV');
    }

    $.ajax({
        url: strurl,
        success: function (data) {
            if (data.error !== null) {
                log_write('normal', 'Failed to apply OC (alt)');
            }
            else {
                log_write('normal', 'Applied OC (alt) successfully');
            }
        },
        error: function () { }
    });
}


function apply_oc_all_alt() {
    var core_max = $('#selected-core-max').val();
    var memory = $('#selected-memory-abs').val();
    var mv_opt = parseInt($('#selected-core-volt').val());
    if (!uvolt_unlocked || isNaN(mv_opt)) mv_opt = null;
    else if (mv_opt < 0) mv_opt = -mv_opt;

    log_write('normal', 'Applying OC (alt) for all devices; core=' + core_max + ' mem=' + memory);
    var urlend = "&core=" + core_max + "&memory=" + memory;

    if (mv_opt != null) {
        urlend += '&uvolt=' + mv_opt;
        log_write('normal', 'Applying undervolt: ' + mv_opt + ' mV');
    }

    for (var i = 0; i < devices.length; ++i) {

        if (devices[i].details.sm_major === 6) {
            log_write('normal', 'Device #' + devices[i].device_id + ': Cannot perform for GPU arch: Pascal');
            continue;
        }

        $.ajax({
            url: url + "setocprofile2?id=" + devices[i].device_id + urlend,
            indexValue: devices[i].device_id,
            success: function (data, indexValue) {
                if (data.error !== null) {
                    log_write('normal', 'Failed to apply OC (alt) for device #' + this.indexValue);
                }
                else {
                    log_write('normal', 'Applied OC (alt) successfully for device #' + this.indexValue);
                }
            }
        });
    }
}


function apply_oc_with_params(dev_id, core_delta, memory_delta, power, vcore) {
    var strurl = url + "setocprofile?id=" + dev_id + "&core=" + core_delta + "&memory=" + memory_delta + "&watts=" + power;
    if (vcore != null) {
        strurl += '&vcore=' + vcore;
        log_write('normal', 'Applying OC, dev=' + dev_id + ' core=' + core_delta + ' mem=' + memory_delta + ' pwr=' + power + ' vcore=' + vcore);
    }
    else
        log_write('normal', 'Applying OC, dev=' + dev_id + ' core=' + core_delta + ' mem=' + memory_delta + ' pwr=' + power);

    $.ajax({
        url: strurl,
        //indexValue: [dev_id, core_delta, memory_delta, power],
        success: function (data) {
            if (data.error !== null) {
                log_write('normal', 'Failed to apply OC');
            }
            else {
                log_write('normal', 'Applied OC successfully');
            }
        }
    });
}


function apply_oc(dev_id) {
    if (dev_id == null)
        dev_id = $('#selected-device').val();
    var core_delta = $('#selected-core').val();
    var memory_delta = $('#selected-memory').val();
    var power = $('#selected-power').val();

    var mv_opt = parseInt($('#selected-core-volt2').val());
    if (!uvolt_unlocked2 || isNaN(mv_opt)) mv_opt = null;
    else if (mv_opt <= 0) mv_opt = 0;
    else if (mv_opt < 500) mv_opt = 500;
    else if (mv_opt > 1000) mv_opt = 1000;

    apply_oc_with_params(dev_id, core_delta, memory_delta, power, mv_opt);
}


function apply_oc_all() {
    var core_delta = $('#selected-core').val();
    var memory_delta = $('#selected-memory').val();
    var power = $('#selected-power').val();

    var mv_opt = parseInt($('#selected-core-volt2').val());
    if (!uvolt_unlocked2 || isNaN(mv_opt)) mv_opt = null;
    else if (mv_opt <= 0) mv_opt = 0;
    else if (mv_opt < 500) mv_opt = 500;
    else if (mv_opt > 1000) mv_opt = 1000;

    var logtxt = '';
    if (mv_opt != null) {
        mv_opt = '&vcore=' + mv_opt;
        logtxt = ' vcore=' + mv_opt;
    }
    else mv_opt = '';

    log_write('normal', 'Applying OC for all devices; core=' + core_delta + ' mem=' + memory_delta + ' pwr=' + power + logtxt);

    for (var i = 0; i < devices.length; ++i) {
        $.ajax({
            url: url + "setocprofile?id=" + devices[i].device_id + "&core=" + core_delta + "&memory=" + memory_delta + "&watts=" + power + mv_opt,
            indexValue: devices[i].device_id,
            success: function (data, indexValue) {
                if (data.error !== null) {
                    // handle err case
                }
                else {
                    log_write('normal', 'Applied OC successfully for device #' + this.indexValue);
                }
            }
        });
    }
}


function reset_oc(dev_id) {

    if (dev_id == null)
        dev_id = $('#selected-device').val();

    log_write('normal', 'Resetting OC, dev=' + dev_id);

    $.ajax({
        url: url + "resetoc?id=" + dev_id,
        success: function (data) {
            if (data.error !== null) {
                // handle err case
            }
            else {
                log_write('normal', 'Reset OC successfully');
            }
        }
    });
}


function reset_oc_all() {
    log_write('normal', 'Resetting OC for all devices');

    for (var i = 0; i < devices.length; ++i) {
        $.ajax({
            url: url + "resetoc?id=" + devices[i].device_id,
            indexValue: devices[i].device_id,
            success: function (data, indexValue) {
                if (data.error !== null) {
                    // handle err case
                }
                else {
                    log_write('normal', 'Reset OC successfully for device #' + this.indexValue);
                }
            }
        });
    }
}


function change_core_clock_max(clk) {
    $('#selected-core-max').val(parseInt($('#selected-core-max').val()) + clk);
}


function change_mem_clock_abs(clk) {
    $('#selected-memory-abs').val(parseInt($('#selected-memory-abs').val()) + clk);
}


function change_core_clock(clk) {
    $('#selected-core').val(parseInt($('#selected-core').val()) + clk);
}


function change_mem_clock(clk) {
    $('#selected-memory').val(parseInt($('#selected-memory').val()) + clk);
}


function change_power(pwr) {
    $('#selected-power').val(parseInt($('#selected-power').val()) + pwr);
}


function change_fan_speed(ss) {
    var a = parseInt($('#selected-fan-speed').val()) + ss;
    if (a < 0) a = 0;
    else if (a > 100) a = 100;
    $('#selected-fan-speed').val(a);
}


function change_fan_temp_gpu(ss) {
    $('#selected-fan-temp-gpu').val(parseInt($('#selected-fan-temp-gpu').val()) + ss);
}


function change_fan_temp_vram(ss) {
    $('#selected-fan-temp-vram').val(parseInt($('#selected-fan-temp-vram').val()) + ss);
}


function at_change_mem_clock(clk) {
    $('#at-memory').val(parseInt($('#at-memory').val()) + clk);
}


function at_change_core_limit_start(clk) {
    $('#at-core-start').val(parseInt($('#at-core-start').val()) + clk);
}


function at_change_core_limit_end(clk) {
    $('#at-core-end').val(parseInt($('#at-core-end').val()) + clk);
}


function refresh_change() {
    var secs = $('#refresh-time').val();
    //console.log(secs);
    $('#refresh-time-text').html(secs);
    refresh_time = parseInt(secs * 1000);
    if (tick_handler != null) {
        clearTimeout(tick_handler);
        _tick();
    }
}


function pre_oc_fill() {
    var dev_id = $('#selected-device').val();
    var dd = devices[dev_id];
    var device_ocs = devices[dev_id].oc_data;
    $('#selected-core').val(device_ocs.core_clock_delta);
    $('#selected-memory').val(device_ocs.memory_clock_delta);
    $('#selected-power').val(device_ocs.power_limit_watts);
    $('#selected-core-max').val(device_ocs.core_clock_limit);
    $('#selected-memory-abs').val(devices[dev_id].gpu_clock_memory);
    $('#at-memory').val(devices[dev_id].gpu_clock_memory);

    if (devices[dev_id].GDDRData !== null) {
        $('#at-mem-min').html(devices[dev_id].GDDRData[0]);
        $('#at-mem-max').html(devices[dev_id].GDDRData[1]);
        $('#at-enable').attr('disabled', false);
    }
    else {
        $('#at-mem-min').html('N/A');
        $('#at-mem-max').html('N/A');
        $('#at-enable').attr('disabled', true);
    }

    $('#selected-fan-mode').val(dd.smartfan.mode);
    $('#selected-fan-speed').val(dd.smartfan.fixed_speed);
    $('#selected-fan-temp-gpu').val(dd.smartfan.target_gpu);
    $('#selected-fan-temp-vram').val(dd.smartfan.target_vram);

    if (dd.oc_limits != undefined) {
        $('#core-delta-limits').html('Min:' + dd.oc_limits.core_delta_min + ' Max:+' + dd.oc_limits.core_delta_max);
        $('#core-max-limits').html('Min:510 Max:' + dd.gpu_clock_core_max);
    }

    allow_uvolt(false);
    allow_uvolt2(false);
}


function get_admin() {
    $.ajax({
        url: url + "elevate",
        success: function (data) {
            if (data.error !== null) {
                log_write('error', 'Failed to acquire administrator privileges! Overclocking will not work.');
            }
            else {
                log_write('normal', 'Administrator privileges acquired!');
            }
        },
        error: function () {
            log_write('normal', 'Administrator privileges acquired!');
        }
    });
}


function save_current_cmds() {
    $.ajax({
        url: url + "cmdcommit",
        success: function (data) {
            if (data.error !== null) {
                log_write('error', 'Failed to save current commands.');
            }
            else {
                log_write('normal', 'Configuration saved!');
                alert('Your current overclock and fan settings have been commited to commands.json file. Previous configuration saved as .bak file.\n\n' +
                    'These settings will be applied next time Excavator is started.');
            }
        },
        error: function () {
        }
    });
}


function apply_credentials() {
    var username = $('#input-username').val();
    var location = $('#input-location').val();
    log_write('normal', 'Setting username: ' + username + ' (location: ' + location + ')');

    $.ajax({
        url: url + "quickstart?id=" + username + '&loc=' + location,
        success: function (data) {
            if (data.error !== null) {
                log_write('error', 'Failed to apply new credentials.');
            }
            else {
                log_write('normal', 'New credentials applied!');
            }
        },
        error: function () {
        }
    });
}


function get_current_credentials() {
    $.ajax({
        url: url + 'api?command={"id":1,"method":"subscribe.info","params":[]}',
        success: function (data) {
            if (data.error !== null) {
            }
            else {
                if (data.address.substring(0, 12) === 'nhmp-ssl.usa')
                    $('#input-location').val('usa');
                else
                    $('#input-location').val('eu');
                $('#input-username').val(data.login);
                //log_write('normal', 'New credentials applied!');
            }
        },
        error: function () {
        }
    });
}


function detect_selected_devices() {
    selected_devices = new Array();
    for (var i = 0; i < devices.length; ++i)
        if ($('#device-' + devices[i].device_id + '-selected').is(":checked"))
            selected_devices.push(i);
}



function make_action_for_selected(sfunc) {
    detect_selected_devices();

    while (selected_devices.length > 0) {
        var popdev = selected_devices.pop();
        sfunc(popdev);
    }
}


function reset_oc_selected() {
    make_action_for_selected(reset_oc);
}


function apply_oc_selected() {
    make_action_for_selected(apply_oc);
}


function apply_oc_selected_alt() {
    make_action_for_selected(apply_oc_alt);
}

function apply_fan_selected() {
    make_action_for_selected(apply_fan);
}


// =========================================
// DEVICE HEALTH
// =========================================

function reset_fan(dev_id) {
    $.ajax({
        url: url + "fanreset?id=" + dev_id,
        success: function (data) {
            if (data.error !== null) {
                // handle err case
            }
            else {
                log_write('normal', 'Fan reset');
                //updateAll();
            }
        }
    });
}


function set_fan(i) {
    var dev_id = devices[i].device_id;
    var core_delta = devices[i].oc_data.core_clock_delta;
    var memory_delta = devices[i].oc_data.memory_clock_delta;
    var power = devices[i].oc_data.power_limit_watts;

    var fan_level = $('#fan-level-' + dev_id).val();

    apply_oc_with_params(dev_id, core_delta, memory_delta, power, fan_level);
}


function set_fan_all(level) {
    var fan_level = $('#fan-speed-all').val();

    for (var i = 0; i < devices.length; ++i) {
        var dev_id = devices[i].device_id;
        var core_delta = devices[i].oc_data.core_clock_delta;
        var memory_delta = devices[i].oc_data.memory_clock_delta;
        var power = devices[i].oc_data.power_limit_watts;

        apply_oc_with_params(dev_id, core_delta, memory_delta, power, fan_level);
    }
}



function all_selected_changed() {
    var tocheck = false;
    if ($("#all-selected").is(":checked")) tocheck = true;
    for (var i = 0; i < devices.length; ++i)
        $('#device-' + devices[i].device_id + '-selected').prop('checked', tocheck);
}


// =========================================
// AUTO TUNE
// =========================================


var at_running = false;
var at_req_to_end = false;
var at_device_id;
var at_device_index;
var at_fastest_core;
var at_eff_core;
var at_wanted_memory;
var at_current_clock;
var at_kt_lowest;
var at_power_sum;
var at_core_min;
var at_core_max;
var at_results;
var at_hashes_per_ke;
var at_prev_fan;


const KT_WAIT_TIME = 2500;
const KT_ITERATIONS = 3;
const CLOCK_STEP = 15;
const ABSOLUTE_CORE_MIN_CLOCK = 210;

var at_next_applied_clock;


// http_call_res:
// 0 = all OK
// 1 = call OK, but method failed
// 2 = call failed
function at_error(http_call_res, err_msg) {

    if (http_call_res !== 0) {

        if (http_call_res === 2)
            log_write('autotune', 'Finished prematurely because HTTP API call failed. Did Excavator crash?');
        else
            log_write('autotune', err_msg);

        $('.auto-tune-disable').each(function () {
            $(this).attr('disabled', false);
        });

        // release scanner
        at_running = false;

        return;
    }

    // report last stable OC found
    if (!at_req_to_end && at_fastest_core != null) {

        // restore fan
        if (at_prev_fan != null) {

            log_write('autotune', 'Restoring FAN, mode=' + at_prev_fan.mode);
            var strurl = url;
            if (at_prev_fan.mode === 1) {
                strurl += 'fanset?id=' + at_device_id + '&level=' + at_prev_fan.fixed_speed;
            }
            else {
                strurl += 'smartfanset?id=' + at_device_id + '&mode=' + at_prev_fan.mode;
            }

            $.ajax({
                url: strurl,
                success: function (data) {
                    if (data.error !== null) {
                    }
                    else {
                    }
                },
                error: function () { }
            });
        }

        if ($("#at-eff").is(":checked")) {
            at_next_applied_clock = at_eff_core;
            at_call("setocprofile2?id=" + at_device_id +
                "&core=" + at_eff_core + "&memory=" + at_wanted_memory,
                function (data) {
                    log_write('autotune', 'Best OC for EFFICIENCY applied (memory: ' + at_wanted_memory +
                        'MHz,&nbsp;core clock limit: ' + at_next_applied_clock + 'MHz)');
                }
            );
        }
        else {
            at_next_applied_clock = at_fastest_core;
            at_call("setocprofile2?id=" + at_device_id +
                "&core=" + at_fastest_core + "&memory=" + at_wanted_memory,
                function (data) {
                    log_write('autotune', 'Best OC for SPEED applied (memory: ' + at_wanted_memory +
                        'MHz,&nbsp;core clock limit: ' + at_next_applied_clock + 'MHz)');
                }
            );
        }
    }
    else {
        // reset OC to return everything back to normal
        $.ajax({
            url: url + "resetoc?id=" + at_device_id,
            success: function (data) {
                log_write('autotune', 'OC has been reset! Please, reapply it.');
            }
        });
    }

    // report error
    log_write('autotune', err_msg);

    // release scanner
    at_running = false;

    if (selected_devices.length > 0) {
        var dev = selected_devices.pop();
        setTimeout(auto_tune_start, 1000, dev);
        return;
    }

    $('.auto-tune-disable').each(function () {
        $(this).attr('disabled', false);
    });
}


function at_call(_url, _action) {
    if (at_req_to_end) {
        at_error(0, 'Cancelled by the user');
        return;
    }

    $.ajax({
        url: url + _url,
        success: function (data) {
            if (data.error !== null) {
                at_error(1, data.error);
            }
            else {
                _action(data);
            }
        },
        error: function (data) {
            at_error(2, null);
        }
    });
}


function at_resetoc(_action) {
    at_call("resetoc?id=" + at_device_id,
        function (data) { _action(data); });
}


function at_core_limit(_core, _action) {
    // {"id":1,"method":"device.set.tdp","params":["0","150"]}
    var _url = 'api?command={"id":1,"method":"device.set.core_abs","params":["' +
        at_device_id + '","' + _core + '"]}';
    at_call(_url, function (data) { _action(data); });
}


function at_get_ktumed(_action) {
    at_call('getkerneltimes?id=' + at_device_id,
        function (data) {
            if (data.kernel_times.umed === 0)
                at_error(1, 'Not mining - please, activate mining to perform AutoTune!');
            else
                _action(data.kernel_times.umed);
        });
}


function auto_tune_start(dev) {
    if (at_running) {
        log_write('autotune', 'Already running');
        return; // already running
    }

    var mem_min = parseInt($('#at-mem-min').html());
    var mem_max = parseInt($('#at-mem-max').html());
    at_wanted_memory = parseInt($('#at-memory').val());
    if (isNaN(at_wanted_memory) || at_wanted_memory < mem_min || at_wanted_memory > mem_max) {
        log_write('autotune', 'Invalid memory value; must be min=' + mem_min + ', max=' + mem_max);
        return;
    }

    if (dev !== null) at_device_id = devices[dev].device_id;
    else at_device_id = $('#selected-device').val();

    at_device_index = devices_indices[at_device_id];
    var at_core_max_dev = devices[at_device_index].gpu_clock_core_max;
    at_hashes_per_ke = devices[at_device_index].hashes_per_ke;
    if (at_hashes_per_ke === null || at_hashes_per_ke === 0)
        at_hashes_per_ke = 1;
    at_core_min = parseInt($('#at-core-start').val());
    if (isNaN(at_core_min) || at_core_min < ABSOLUTE_CORE_MIN_CLOCK || at_core_min >= at_core_max) {
        log_write('autotune', 'Invalid core start value; must be min=210, max=' + at_core_max);
        return;
    }

    at_core_max = parseInt($('#at-core-end').val());
    if (isNaN(at_core_max) || at_core_max < at_core_min || at_core_max > at_core_max_dev) {
        log_write('autotune', 'Invalid core end value; must be min=' + at_core_min + ', max=' + at_core_max_dev);
        return;
    }

    if (devices[at_device_index].gpu_power_usage == null) {
        log_write('autotune', 'Device #' + at_device_id + ': Cannot perform without support for power consumption reporting!');
        return;
    }

    if (devices[at_device_index].details.sm_major === 6) {
        log_write('autotune', 'Device #' + at_device_id + ': Cannot perform for GPU arch: Pascal');
        return;
    }

    $('.auto-tune-disable').each(function () {
        $(this).attr('disabled', true);
    });
    $('#stop_auto_tune').attr('disabled', false);

    // round at_core_min number
    var aa = at_core_min / CLOCK_STEP;
    at_core_min = Math.floor(CLOCK_STEP * Math.floor(aa));
    $('#at-core-start').val(at_core_min);

    at_req_to_end = false;
    at_running = true;
    at_fastest_core = null;
    at_eff_core = null;
    at_results = new Array();

    log_write('autotune', 'Starting up for device id #' + at_device_id + ',<break>&nbsp;&nbsp;&nbsp;absolute memory clock: ' + at_wanted_memory + 'MHz');
    log_write('autotune', 'Starting clock limit: ' + at_core_min + 'MHz,<break>&nbsp;&nbsp;&nbsp;ending clock limit: ' + at_core_max + 'MHz');

    var delta_clock = at_core_max - at_core_min;
    var clock_it = delta_clock / CLOCK_STEP;
    if (clock_it < 1) clock_it = 1;
    var total_time_sec = clock_it * KT_ITERATIONS * KT_WAIT_TIME * 0.001;
    log_write('autotune', 'Please, be patient,<break>&nbsp;&nbsp;&nbsp;this will take approx. ' + total_time_sec.toFixed(2) + ' seconds!');

    at_prev_fan = devices[at_device_index].smartfan;

    // 1. reset OC first
    log_write('autotune', 'Reset OC, set fan to 100%');

    at_resetoc(function (data) {
        at_call("fanset?id=" + at_device_id + "&level=100", function (data) {
            at_step_3_4();
        });
    });
}


function auto_tune_start_selected() {

    detect_selected_devices();

    if (selected_devices.length < 1) {
        log_write('autotune', 'No devices selected');
        return;
    }

    var str = 'Doing for following devices: ';
    for (var i = 0; i < selected_devices.length; ++i)
        str += '#' + devices[selected_devices[i]].device_id + ' ';

    log_write('autotune', str);

    var dev = selected_devices.pop();
    auto_tune_start(dev);
}


function auto_tune_finish_now() {
    if (!at_running) return;

    at_for_devices = new Array();
    log_write('autotune', 'Finishing by setting max core clock limit: ' + at_current_clock);
    //at_req_to_end = true;
    at_core_max = at_current_clock; pwr
    $('#stop_auto_tune').attr('disabled', true);
}


function at_step_3_4() {

    // 3. set mem clock to selected one
    // 4. set core clock limit to max
    //log_write('autotune', 'Set core clock limit to min: ' + at_core_min + 'MHz, mem clock: ' + at_wanted_memory + 'MHz');

    at_current_clock = at_core_min;
    at_call("setocprofile2?id=" + at_device_id +
        "&core=" + at_core_min + "&memory=" + at_wanted_memory,
        function (data) {
            at_step_5_mess_ktumed_start();
        });
}


function at_step_5_inc_core() {

    if (at_current_clock >= at_core_max) {
        // we have reached the end, cannot decrease more
        // just use last best kt umed
        //at_step_6();
        if (at_results.length == 0) {
            at_error(0, 'No results!');
            return;
        }

        // find best clock with lowest kt
        var best_speed = at_results[0];
        var best_eff = at_results[0];
        for (var i = 1; i < at_results.length; ++i) {
            if (at_results[i].kt < best_speed.kt)
                best_speed = at_results[i];
            if (at_results[i].eff > best_eff.eff)
                best_eff = at_results[i];
        }

        at_fastest_core = best_speed.clock;
        at_eff_core = best_eff.clock;

        log_write('autotune', 'Found best SPEED @ max core clock limit: ' + at_fastest_core +
            'MHz (eff: ' + best_speed.eff.toFixed(8) + ' ke/J,&nbsp;heff: ' + best_speed.heff.toFixed(2) + 'kH/J)');
        log_write('autotune', 'Found best EFFICIENCY @ max core clock limit: ' + at_eff_core +
            'MHz (eff: ' + best_eff.eff.toFixed(8) + ' ke/J,&nbsp;heff: ' + best_eff.heff.toFixed(2) + 'kH/J)');
        at_error(0, 'All done!');

        return
    }

    at_current_clock += CLOCK_STEP;

    //log_write('autotune', 'Testing core limit: ' + at_current_clock);
    at_core_limit(at_current_clock, function (data) {
        at_step_5_mess_ktumed_start();
    });
}


function at_step_5_mess_ktumed_start() {

    at_kt_lowest = 999999999;
    at_power_sum = 0;

    // need to wait a bit for kt to fill
    setTimeout(at_step_5_mess_ktumed_itt, KT_WAIT_TIME, KT_ITERATIONS);
}


function at_step_5_mess_ktumed_itt(itt) {
    at_get_ktumed(function (data) {
        if (data < at_kt_lowest) at_kt_lowest = data;
        at_power_sum += devices[at_device_index].gpu_power_usage;
        --itt;
        if (itt === 0) at_step_5_mess_ktumed_fin();
        else setTimeout(at_step_5_mess_ktumed_itt, KT_WAIT_TIME, itt);
    });
}


function at_step_5_mess_ktumed_fin() {

    at_power_sum /= KT_ITERATIONS;

    var oneeff = at_kt_lowest * at_power_sum * 0.000001; // us/ke * J/s * 1/1000000 = J/ke
    var eff = 1 / oneeff; // = ke/J (kernel executions per Joule)
    var hash_eff = eff * at_hashes_per_ke * 0.001; // =kH/J (khashes per Joule)
    log_write('autotune', 'kt.umed: ' + at_kt_lowest + ' us,&nbsp;&nbsp;clock: ' + at_current_clock + 'MHz,<break>&nbsp;&nbsp;pwr: ' +
        at_power_sum.toFixed(2) + 'W,&nbsp;&nbsp;eff: ' + eff.toFixed(8) + ' ke/J,&nbsp;&nbsp;heff: ' + hash_eff.toFixed(2) + 'kH/J');
    at_results.push({ "kt": at_kt_lowest, "clock": at_current_clock, "power": at_power_sum, "eff": eff, "heff": hash_eff });

    at_step_5_inc_core();
}