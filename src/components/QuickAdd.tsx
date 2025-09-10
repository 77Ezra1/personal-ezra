import { Save, Wand2 } from 'lucide-react'
import IconButton from './ui/IconButton'
import Input from "./ui/Input"
import { generatePassword, estimateStrength } from "../lib/password"

type Props = {
  title: string
  setTitle: (v: string) => void
  url: string
  setUrl: (v: string) => void
  username: string
  setUsername: (v: string) => void
  pwd: string
  setPwd: (v: string) => void
  onSave: () => void
}

export default function QuickAdd({
  title, setTitle,
  url, setUrl,
  username, setUsername,
  pwd, setPwd,
  onSave,
}: Props) {
  const strength = estimateStrength(pwd)

  return (
    <div className="p-3 border-t bg-white">
      <div className="text-xs text-gray-500 mb-2">快速新建</div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input className="w-44" placeholder="标题" value={title} onChange={e => setTitle(e.target.value)} />
        <Input className="w-44" placeholder="网址" value={url} onChange={e => setUrl(e.target.value)} />
        <Input className="w-44" placeholder="用户名" value={username} onChange={e => setUsername(e.target.value)} />
        <Input className="w-44" placeholder="密码" value={pwd} onChange={e => setPwd(e.target.value)} />

        {/* 强度条 */}
        <div className="flex items-center gap-1 text-xs">
          强度：
          <div className="w-24 h-2 bg-gray-200 rounded">
            <div
              className="h-2 rounded"
              style={{
                width: `${(strength.score + 1) * 20}%`,
                background: strength.score < 2 ? '#f87171' : strength.score < 3 ? '#fbbf24' : '#10b981'
              }}
            />
          </div>
        </div>

        <IconButton onClick={() => setPwd(generatePassword())} srLabel="生成密码">
          <Wand2 className="w-4 h-4"/>
        </IconButton>
        <IconButton onClick={onSave} srLabel="保存">
          <Save className="w-4 h-4"/>
        </IconButton>
      </div>

      {/* 需要的话也可以在这里放标签选择器 */}
    </div>
  )
}