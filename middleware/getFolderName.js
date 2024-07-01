const websiteModel = require('../modules/website');

const getFolderNameFromRequest = async (url)=>{
 try{
    const website = await websiteModel.findOne({websiteName: url});
    if(!website){
        return null;
    }
    const arr = website.filePath.split('/');
    // console.log(arr.pop())
    return arr.pop();
 }catch(err){
    console.log(err)
 }
}
module.exports = getFolderNameFromRequest;