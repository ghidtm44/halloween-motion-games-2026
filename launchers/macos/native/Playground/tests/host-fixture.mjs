// Synthetic structured vision/comedy response, never a live-model evaluation.
export function comedyFixture(line,patch={}){
 const empty=line==='[[WAIT]]',adult=line.startsWith('[[ADULT]]');
 return JSON.stringify({speak:!empty,scene:empty?'empty':'guests',audience:adult?'adults':'family',subject:'silver cape',topic:'cape',observation:'visible silver cape',premise:'cape needs separate dressing room',mechanism:'personification',line:empty?'':line.replace(/^\[\[(ADULT|FAMILY)\]\]\s*/,''),...patch});
}
