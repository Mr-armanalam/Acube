import mongoose from "mongoose";

const userschema=mongoose.Schema({
    email:{type:String,require:true},
    name:{type:String},
    username:{type:String,require:true},
    desc:{type:String},
    picture:{type:String},
    reputation:{type:Number, default: 0},
    joinedon:{type:Date,default:Date.now},
    downloadsToday: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
    downloads: [{ title: String, date: Date }]
})

export default mongoose.model("User",userschema);



