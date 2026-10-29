// Same routes and data, separate presentation chosen by the local command.
// A = Ruben's pixel version (the client's own identity); B = our modern version.
export const presentation = process.env.FPB_VARIANT ?? 'a';
if (!['a', 'b', 'adapted'].includes(presentation)) throw new Error('Unknown Frog Pond Boys variant');
export const look = presentation === 'a' ? 'pixel' : 'modern';
export const artworkMode = look === 'pixel' ? 'original' : 'adapted';
