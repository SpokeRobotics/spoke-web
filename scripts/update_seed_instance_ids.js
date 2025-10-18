#!/usr/bin/env node
// Rewrite public/store-seed instance IDs to new hybrid scheme, in-place
// - Only mutates spoke://instances/* ids
// - Updates deep references

import fs from 'fs'
import path from 'path'
import url from 'url'
import { shortTypeHash } from '../lib/store/id.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const seedDir = path.join(root, 'public', 'store-seed')

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
function djb2Hash(input) { let h = 5381 >>> 0; for (let i=0;i<input.length;i++) h = (((h<<5)+h) + input.charCodeAt(i)) >>> 0; return h>>>0 }
function enc62u32(n){ if(n===0) return '0'; let s=''; while(n>0){ const r=n%62; s=BASE62[r]+s; n=Math.floor(n/62)} return s }

function isInstanceId(s){ return typeof s === 'string' && s.startsWith('spoke://instances/') }

function genDeterministic(oldId, typeId){
  const prefix = shortTypeHash(typeId)
  const tail = enc62u32(djb2Hash(String(oldId||'')+'|'+String(typeId||''))).padStart(6,'0')
  return `spoke://instances/${prefix}-${tail}`
}

function walkReplace(obj, map){
  if (obj == null) return obj
  if (typeof obj === 'string') return map.get(obj) || obj
  if (Array.isArray(obj)) return obj.map(v => walkReplace(v, map))
  if (typeof obj === 'object') {
    const out = {}
    for (const [k,v] of Object.entries(obj)) out[k] = walkReplace(v, map)
    return out
  }
  return obj
}

function main(){
  const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.json'))
  // pass 1: read all docs and build global mapping
  const mapping = new Map()
  const fileDocs = []
  for (const f of files) {
    const file = path.join(seedDir, f)
    let json
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { console.error('Skip (invalid JSON):', file); continue }
    const docs = Array.isArray(json) ? json : [json]
    fileDocs.push({ file, json, docs })
    for (const d of docs) {
      const id = d?.id
      const typeId = d?.type
      if (isInstanceId(id) && typeof typeId === 'string') {
        const nid = genDeterministic(id, typeId)
        if (nid !== id) mapping.set(id, nid)
      }
    }
  }
  if (mapping.size === 0) { console.log('No instance IDs to update'); return }
  // pass 2: apply mapping to all files
  for (const { file, json, docs } of fileDocs) {
    const remapped = docs.map(d => walkReplace(d, mapping))
    const out = Array.isArray(json) ? remapped : remapped[0]
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8')
    console.log('Updated', path.basename(file))
  }
}

main()


