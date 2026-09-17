(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ReportVizOptions=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  var DIRECT_UPLOAD_MAX_BYTES=10*1024*1024;
  var MIME_BY_EXTENSION={
    pdf:'application/pdf',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt:'text/plain'
  };

  function normalizeReportMode(value){
    if(value===undefined||value===null||value==='')return'standard';
    if(value==='standard'||value==='scored')return value;
    throw new Error('报告版本无效，请重新选择');
  }

  function buildUploadMetadata(file){
    if(!file||typeof file.name!=='string')throw new Error('文件数据无效');
    var filename=file.name.trim();
    if(!filename||filename.length>255||/[\\/\0\r\n]/.test(filename))throw new Error('文件名无效');
    var parts=filename.split('.');
    var ext=parts.length>1?parts.pop().toLowerCase():'';
    if(!MIME_BY_EXTENSION[ext])throw new Error('仅支持 .pdf / .docx / .txt 文件');
    if(!Number.isFinite(file.size)||file.size<=0)throw new Error('文件内容为空');
    if(file.size>DIRECT_UPLOAD_MAX_BYTES)throw new Error('文件超过 10MB 限制');
    return{
      filename:filename,
      size:file.size,
      mimeType:MIME_BY_EXTENSION[ext]
    };
  }

  function buildParsePayload(reportMode,input){
    var payload={report_mode:normalizeReportMode(reportMode)};
    if(input&&typeof input.uploadTicket==='string'&&input.uploadTicket){
      payload.upload_ticket=input.uploadTicket;
      return payload;
    }
    if(input&&typeof input.text==='string'&&input.text.trim()){
      payload.text=input.text;
      return payload;
    }
    throw new Error('请上传文件或输入文本');
  }

  return{
    DIRECT_UPLOAD_MAX_BYTES:DIRECT_UPLOAD_MAX_BYTES,
    buildParsePayload:buildParsePayload,
    buildUploadMetadata:buildUploadMetadata,
    normalizeReportMode:normalizeReportMode
  };
});
