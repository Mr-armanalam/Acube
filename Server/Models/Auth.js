import mongoose from "mongoose";

const userschema=mongoose.Schema({
    email:{type:String,require:true},
    name:{type:String},
    username:{type:String,require:true},
    desc:{type:String},
    picture:{type:String},
    joinedon:{type:Date,default:Date.now}
})

export default mongoose.model("User",userschema)