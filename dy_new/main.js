//babel库及文件模块导入
const fs = require('fs');

//babel库相关，解析，转换，构建，生产
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const types = require("@babel/types");
const generator = require("@babel/generator").default;

function get_jsonObjet(text){
    // 去除花括号和空格，只留下内部内容
    text = text.replace(/{|}/g, '').trim();
    // 使用正则表达式匹配键值对
    var regex = /(\d+):\s*\[["']([^"']+)["'],\s*([^,]+),\s*(\d+)\]/g;
    var jsonObject = {};
    var match;
    while ((match = regex.exec(text)) !== null) {
      var key = match[1];
      var name = match[2];
      var decodeFunction = match[3];
      var value = match[4];
      jsonObject[key] = [name, decodeFunction, parseInt(value)];
    }
    return jsonObject
}

function get_id_type(id_type){
    switch(id_type){
        case "int64String":
            id_type ="string";
            break;
        case "string":
            id_type ="string";
            break;
        case "int32":
            id_type = "int32";
            break;
        case "bool":
            id_type = "bool";
            break;
        case "uint64String":
            id_type ="string";
            break;
        case "bytes":
            id_type="bytes";
            break;
    }
    return id_type
}

function cut_type_text(input){
    // 使用split()将字符串分割成数组
    var parts = input.split('.');

    // 如果数组长度大于1，去掉结尾的'decode'，然后取中间部分；否则保留原始字符串
    var result = parts.length > 1 ? parts.slice(1).join('.') : input;

    // 如果结尾是'decode'，去掉它
    if (input.endsWith('decode')) {
      result = result.slice(0, -7); // 去掉最后的6个字符，即'.decode'
    }
    return result
}

function findDifferentElements(arr1, arr2) {
  // 找出在 arr1 中存在但在 arr2 中不存在的元素
  const differentInArr1 = arr1.filter(item => !arr2.includes(item));

  // 找出在 arr2 中存在但在 arr1 中不存在的元素
  const differentInArr2 = arr2.filter(item => !arr1.includes(item));

  // 将这两组不同的元素合并成一个数组
  const differentElements = differentInArr1.concat(differentInArr2);

  return differentElements;
}


const common_visitor={
    ObjectExpression(path,scope){
        text=path.toString()
        if (text!='{}'){
            jsonObject=get_jsonObjet(text)
        // key_data=JSON.parse(path.toString())
        referenceKeys = []
        for(i in jsonObject){
            id_st=''
            location=i
            id_name=jsonObject[i][0]
            id_type=get_id_type(cut_type_text(jsonObject[i][1]))
            if(msg_type_list[id_name] == 'Array'){
                id_st='repeated'
            }
            referenceKeys.push(id_name)
            // console.log(msg_name,'====>',`${id_st} ${id_type} ${id_name} = ${location}`)
            middle_str+=`            ${id_st} ${id_type} ${toSnakeCase(id_name)} = ${location};\n`
        }
        providedKeys = Object.keys(msg_type_list); // 获取提及的键
        differentElements = findDifferentElements(referenceKeys, providedKeys)
        }
    }
}

const map_msg_visitor={
    IfStatement(path,scope){
        if(path.node.test.type=='BinaryExpression' && path.node.test.operator =='==='){
            location=path.node.test.left.value
            id_name=path.node.consequent.body[0].expression.right.left.property.name
            // id_name=differentElements[0]
            id_type='map'
            id_type_list=[]
            path.traverse({
                SwitchCase(path2){
                    if(types.isLiteral(path2.node.test)){
                        temp=path2.node.consequent[0]
                        if(types.isExpressionStatement(temp)){
                            if(types.isCallExpression(temp.expression.right)){
                                id_type_code=generator(temp.expression.right.callee).code
                                id_type=get_id_type(cut_type_text(id_type_code))
                                // console.log(id_type)
                                id_type_list.push(id_type)
                            }
                        }

                    }
                }
            })
            middle_str+=`            map<${id_type_list.join(', ')}>`+` ${toSnakeCase(id_name)} = ${location};\n`
            // console.log(`map<${id_type_list.join(', ')}>`+` ${id_name} = ${location}`)
        }
    }
}

const mul_map_msg_visitor={
    SwitchStatement(path,scope){
        if (types.isIdentifier(path.node.discriminant)){
            // console.log(path.node.discriminant.name)
            switch_cases=path.node.cases
            for(sw of switch_cases){
                if(types.isLiteral(sw.test)){
                   // console.log(generator(ca).code)
                    consequent_list=sw.consequent
                    exp=consequent_list[0]
                    id_name=exp.expression.right.left.property.name
                    location=sw.test.value
                    // console.log(id_name,location)
                    //构造可解析的AST语法树才能traverse
                    sw_code='switch(x){'+generator(sw).code+'}'
                    // console.log(sw_code)
                    let sw_code_ast = parser.parse(sw_code);
                    traverse(sw_code_ast,{
                        SwitchStatement(path2,score){
                            if(types.isIdentifier(path2.node.discriminant))return;
                            //沿用上面的处理就可以了
                            id_type_list=[]
                            path2.traverse({
                                SwitchCase(path3){
                                    if(types.isLiteral(path3.node.test)){
                                        temp=path3.node.consequent[0]
                                        if(types.isExpressionStatement(temp)){
                                            if(types.isCallExpression(temp.expression.right)){
                                                id_type_code=generator(temp.expression.right.callee).code
                                                id_type=get_id_type(cut_type_text(id_type_code))
                                                // console.log(id_type)
                                                id_type_list.push(id_type)
                                            }
                                        }

                                    }
                                }
                            })
                        }
                    })
                    middle_str+=`            map<${id_type_list.join(', ')}>`+` ${toSnakeCase(id_name)} = ${location};\n`
                    // console.log(`map<${id_type_list.join(', ')}>`+` ${id_name} = ${location}`)
                }
            }
        }
    }
}

function toPascalCase(name) {
  return name.replace(/(?:^|-)(\w)/g, (_, c) => c.toUpperCase());
}
function toSnakeCase(name) {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase();
}
//解决递归
function recursion(re_constructors,re_path){
  let elementToRemove = 'decode';
  let constructors_new = re_constructors.filter(item => item !== elementToRemove);
  // console.log(msg_name2,'=====>',constructors_new2)
  for(key_name of  constructors_new){
      // console.log(second_name)
      if(re_path.prototype){
          key_path=re_path.prototype.constructor[key_name]
      }
      else {
          key_path=re_path[key_name]
      }
      key_constructors=Object.keys(key_path.prototype.constructor)
      msg_type_list3={}
      msg_name3=toPascalCase(key_name)
      middle_str+=`            message ${msg_name3} {\n`
      result3=JSON.parse(JSON.stringify(key_path.prototype))
      // console.log(result)
      for(i in result3){
          if (Array.isArray(result3[i])) {
              msg_type_list[i]='Array'
              continue;
          }
          msg_type_list[i]= typeof result3[i]
      }
      // third_constructors=Object.keys(second_path.prototype.constructor)
      jscode3='!'+key_path.prototype.constructor.decode.toString()
      let ast3 = parser.parse(jscode3);
      traverse(ast3, common_visitor);
      if (differentElements.length > 0){
          if (differentElements.length ==1)
          {
              // console.log(msg_name3, '====>', differentElements)
              traverse(ast3, map_msg_visitor);
          }else{
            // console.log(msg_name3, '====>', differentElements)
            traverse(ast3,mul_map_msg_visitor);
          }
      }
      if(key_constructors.length>1 && !key_constructors.includes("encode")){
          recursion(key_constructors,key_path)
      }
      middle_str+='            }\n'
  }
}

//读取文件
let js_code = fs.readFileSync('im.js', {encoding: "utf-8"});
eval(js_code)
proto_str='syntax = "proto3";\n'
word="transport.webcast.im"
key_path_word_list=word.split('.')
repeact_num=key_path_word_list.length
path=protobuf.roots
for(key_path_word of key_path_word_list){
    path=path[key_path_word]
    proto_str+=`message ${key_path_word} {\n`
}
middle_str=''
msg_type_list={}
kk_path=path
rre_constructors=Object.keys(kk_path)
recursion(rre_constructors,kk_path)
proto_str+=`${middle_str}\n\n`
proto_str+='}\n'.repeat(repeact_num)
// console.log(proto_str)
fs.writeFile(`${word.replaceAll('.','_')}.proto`, proto_str, (err) => {});
