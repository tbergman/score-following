var initTop, initLeft;
var pageRef;

var facsPoints = {}; //stores zone to when info
var facsTimes = []; //stores times as ints
var facsIntToString = {}; //dict to change facsTimes to facsPoints keys
var pageRefs = [];
var highlightMode = false;
var highlightInterval;
var nextFacsTimeIdx = 0;

var meiEditor;
var waveformAudioPlayer;
var divaData;
var vidaData;

var divaSettings = {
    enableAutoHeight: true,
    fixedHeightGrid: false,
    iipServerURL: "http://localhost/fcgi-bin/iipsrv.fcgi",
    objectData: "diva_data/holst2Tiff.json",
    imageDir: "/srv/images/holst2Tiff/",
    // iipServerURL: "http://diva.simssa.ca/fcgi-bin/iipsrv.fcgi",
    // objectData: "/salzinnes.json",
    // imageDir: "/srv/images/cantus/cdn-hsmu-m2149l4/",
    enableAutoscroll: true,
    disableAutoscrollPrefs: true,
    disableManualScroll: true,
    enableCanvas: true,
    enableDownload: true,
    enableHighlight: true,
    enableAutoTitle: false
    //verticallyOriented: false
};

var element = "#mei";
var meixSettings = 
{
    'meiEditorLocation': 'js/meix.js/',
    'divaInstance': divaData,
    'skipXMLValidator': true,
    // 'disableShiftNew': true,
    'meiToIgnore': ['system'],
    // 'initializeWithFile': 'mei_data/holst2-onepage.xml'
    'initializeWithFile': 'mei_data/krebs.mei'
    // 'initializeWithFile': 'meiToMidi/cdn-hsmu-m2149l4_002r.mei'
};
var plugins = ["js/meix.js/js/local/plugins/meiEditorZoneDisplay.js"];

var vidaSettings = 
{
    horizontallyOriented: 0,
    fileOnLoadIsURL: false,
    workerLocation: "/js/vida.js/verovioWorker.js"
};

$(document).ready(function() {
    $('#renderer').diva(divaSettings);
    divaData = $("#renderer").data('diva');
    meixSettings.divaInstance = divaData;

    $('#waveform').wap({}); 
    waveformAudioPlayer = $("#waveform").data('wap');

    meiEditor = new MeiEditor(element, meixSettings, plugins);
    $(window).on('meiEditorLoaded', function(){
        meiEditor = $("#mei").data('AceMeiEditor');
        if(!meixSettings.hasOwnProperty('initializeWithFile'))
            createDefaultMEI();
        
        // meiEditor.events.subscribe("PageEdited", regenerateTimePoints);
        $("#playback-checkbox").on('change', function(e)
        {
            $("#autoscroll-wrapper").css('display', ($("#playback-checkbox").is(":checked") ? "inline" : "none"));
            if(!$("#playback-checkbox").is(":checked"))
            {
                turnOffHighlights();
            }

            $("#autoscroll-checkbox").on('change', function(e)
            {
                if(highlightMode != $("#autoscroll-checkbox").is(":checked"))
                {
                    highlightMode = $("#autoscroll-checkbox").is(":checked");
                }
                
                if(waveformAudioPlayer.isPlaying() && highlightMode)
                {
                    updateHighlights();
                }
                else if (!highlightMode)
                {
                    turnOffHighlights();
                }
            });
        });
        $("#playback-checkbox").after("<button onclick='regenerateTimePoints()'>Reload MEI</button>");
        $("#pause-button").on('click', function()
        {
            if (highlightMode) turnOffHighlights();
        });

        $("#play-button").on('click', function()
        {
            if (highlightMode) updateHighlights();
        });

        meiEditor.events.subscribe("ActivePageChanged", function(filename) {
            console.log(filename, meiEditor.isActivePageLinked(filename));
        });
        meiEditor.events.subscribe("NewFile", function(a, filename) {
            console.log(filename, meiEditor.isActivePageLinked(filename));
        });

        //we need the facs points to start and this will update zones
        regenerateTimePoints();
    });
});

// Triggers a call to publishZones and runs onUpdate on the results
var meiUpdateStartFunction;
var meiUpdateEndFunction;
var endHandler;
function regenerateTimePoints()
{    
    var parsed = meiEditor.getPageData(meiEditor.getActivePageTitle()).parsed;
    if (meiEditor.isActivePageLinked())
    {
        switchToRenderer("diva", parsed);
        meiEditor.events.subscribe('ZonesWereUpdated', divaUpdate);
        meiEditor.events.publish('UpdateZones');
    }
    else
    {
        switchToRenderer("vida", parsed);
        vidaUpdate(parsed);
    }
}

var switchToRenderer = function(which, newFile)
{
    if (which === "diva" && !divaData)
    {
        vidaData.destroy();
        $('#renderer').diva(divaSettings);
        vidaData = null;
        divaData = $('#renderer').data('diva');
        meixSettings.divaInstance = divaData;

        meiUpdateStartFunction = function(time) 
        {
            meiEditor.localLog("Got a request for a zone at "+ time);
            meiEditor.startNewHighlight();
            endHandler = meiEditor.events.subscribe('NewZone', meiUpdateEndFunction);
        };
        meiUpdateEndFunction = function(page, prevZone, newZone, uuid)
        {
            meiEditor.events.unsubscribe(endHandler);
            regenerateTimePoints();
            insertNewTimepoint(meiEditor.getPageData(meiEditor.getActivePageTitle()).parsed, uuid);
            waveformAudioPlayer.startAudioPlayback();
        };
        return "diva";
    }

    if (which === "vida" && !vidaData)
    {
        divaData.destroy();
        vidaSettings.fileOnLoad = newFile.children[0].outerHTML;
        $('#renderer').vida(vidaSettings);
        divaData = null;
        vidaData = $('#renderer').data('vida');

        meiUpdateStartFunction = function(time) 
        {
            meiEditor.localLog("Got a request for a zone at "+ time);
            endHandler = mei.Events.subscribe('MeasureClicked', meiUpdateEndFunction);
        };
        meiUpdateEndFunction = function(measureObj)
        {
            mei.Events.unsubscribe(endHandler);
            regenerateTimePoints();
            insertNewTimepoint(meiEditor.getPageData(meiEditor.getActivePageTitle()).parsed, measureObj.attr('id'));
            waveformAudioPlayer.startAudioPlayback();
        };

        return "vida";
    }
};

var insertNewTimepoint = function(parsed, targetUUID)
{
    var timelines = parsed.querySelectorAll("*|timeline");
    var activeTimeline;
    if (timelines.length === 0)
    {
        var music = parsed.querySelector("*|music");
        activeTimeline = document.createElement("timeline");
        activeTimeline.setAttribute('xml:id', genUUID());
        music.appendChild(activeTimeline);
    }
    else
    {
        // Switch based off audio file name?
        activeTimeline = timelines[0];
    }

    var newWhen = document.createElement("when");
    var whenUUID = genUUID();
    newWhen.setAttribute('xml:id', whenUUID);
    newWhen.setAttribute('absolute', waveformAudioPlayer.currentTimeToPlaybackTime());
    activeTimeline.appendChild(newWhen);

    var targetObj = parsed.querySelector("*[*|id='" + targetUUID + "']");
    targetObj.setAttribute('when', whenUUID);
    rewriteAce(meiEditor.getPageData(meiEditor.getActivePageTitle()))
;};

var divaUpdate = function(facsDict)
{
    facsPoints = {};

    var pageTitles = meiEditor.getLinkedPageTitles();
    var divaPages = Object.keys(pageTitles);
    var idx = pageTitles.length;

    //create facsPoints, a dict of {timestamp string: [highlightID1, highlightID2...]}
    while(idx--)
    {
        var divaFilename = divaPages[idx];
        var curTitle = pageTitles[divaIdx];
        var parsed = meiEditor.getPageData(curTitle).parsed;

        var whenPoints = parsed.querySelectorAll("when");
        var whenIdx = whenPoints.length;

        while(whenIdx--)
        {
            var thisWhen = whenPoints[whenIdx];
            var whenID = thisWhen.getAttribute("xml:id");
            var whenAbs = thisWhen.getAttribute('absolute');
            facsPoints[whenAbs] = [];

            var notes = parsed.querySelectorAll("[*|when='" + whenID + "']");
            var noteIdx = notes.length;

            while(noteIdx--)
            {
                facsPoints[whenAbs].push(notes[noteIdx].getAttribute('facs'));
            }

        }
    }

    //create facsIntToString, a dict of {facsTimeInt: facsTimeString} where facsTimeString is a key in facsPoints
    facsIntToString = {};

    var facsIntToStringPrep = {};
    var facsStrings = Object.keys(facsPoints);
    var facsInts = [];
    var curString, curFloat;
    for (idx = 0; idx < facsStrings.length; idx++)
    {
        curString = facsStrings[idx];
        curFloat = stringTimeToFloat(curString);
        facsIntToStringPrep[curFloat] = curString;
        facsInts.push(curFloat);
    }

    facsInts.sort(function(a, b)
    {
        return parseFloat(a) - parseFloat(b);
    });

    for (idx = 0; idx < facsInts.length; idx++)
    {
        var compFloat = facsInts[idx];
        for (curFloat in facsIntToStringPrep)
        {
            curString = facsIntToStringPrep[curFloat];
            if (compFloat == curFloat && facsTimes.indexOf(compFloat) == -1)
            {
                facsTimes.push(compFloat);
                facsIntToString[compFloat] = curString;
                break;
            }
        }
    }

    meiEditor.events.unsubscribe('ZonesWereUpdated', divaUpdate);
};

var vidaUpdate = function(parsed)
{

};

function turnOffHighlights()
{
    window.clearTimeout(highlightInterval);
}

function updateHighlights()
{
    var currentFacsTime = facsTimes[nextFacsTimeIdx];
    var string = facsIntToString[currentFacsTime];
    meiEditor.deselectAllHighlights();

    for (var highlight in facsPoints[string])
    {
        highlightID = facsPoints[string][highlight];
        meiEditor.selectHighlight("#" + highlightID);
    }

    nextFacsTimeIdx++;
    var nextFacsTime = facsTimes[nextFacsTimeIdx];

    var msDifference = (nextFacsTime - currentFacsTime) * 1000;

    console.log(msDifference);
    window.clearTimeout(highlightInterval);
    highlightInterval = window.setTimeout(updateHighlights, msDifference);
}

function createDefaultMEI()
{
    var timeUUID = genUUID();
    var defaultMEIString = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<mei xmlns="http://www.music-encoding.org/ns/mei" xml:id="' + genUUID() + '" meiversion="2013">',
    '  <meiHead xml:id="' + genUUID() + '">',
    '    <fileDesc xml:id="' + genUUID() + '">',
    '      <titleStmt xml:id="' + genUUID() + '">',
    '        <title xml:id="' + genUUID() + '"/>',
    '      </titleStmt>',
    '      <pubStmt xml:id="' + genUUID() + '"/>',
    '    </fileDesc>',
    '  </meiHead>',
    '  <music xml:id="' + genUUID() + '">',
    '    <timeline xml:id="' + genUUID() + '" origin="' + timeUUID + '">',
    '      <when xml:id="' + timeUUID + '" absolute="00:00:00"/>',
    '    </timeline>',
    '    <facsimile xml:id="' + genUUID() + '">'];
    
    var totalPages = divaData.getSettings().numPages;
    for(var idx = 0; idx < totalPages; idx++)
    {
        pageUUID = genUUID();
        pageRefs[idx] = pageUUID;
        defaultMEIString.push('      <surface n="' + idx + '" xml:id="' + pageUUID + '">');
        defaultMEIString.push('      </surface>');
    }

    var meiAppend = ['    </facsimile>',
    '  </music>',
    '</mei>'];

    for (var line in meiAppend) defaultMEIString.push(meiAppend[line]);

    pageRef = meiEditor.getPageData(meiEditor.getActivePageTitle());
    pageRef.session.doc.insertLines(0, defaultMEIString);
}
