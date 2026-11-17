// Render reuses upstream connections longer than Node's five-second default.
export function tuneHttpServer(server) {
 server.keepAliveTimeout=120000;
 server.headersTimeout=121000;
 return server;
}
// Never include messages, stack traces, connection strings or arbitrary provider values.
export function startupDiagnostic(error,stage) {
 const codes=new Set(['POND_WRITER_BUSY','POND_STALE_INSTANCE','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EADDRINUSE','EACCES','ENOENT','28P01','3D000','53300','57P01','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT']);
 return {event:'pond_startup_failure',stage:['configuration','listener','database','application','handover'].includes(stage)?stage:'unknown',code:codes.has(error?.code)?error.code:'UNAVAILABLE'};
}
