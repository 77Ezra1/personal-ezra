import clsx from 'clsx'

export default function Badge({ children, color='gray', className='' }: any) {
  const colors: Record<string,string> = {
    gray:'bg-gray-100 text-gray-800 border-gray-200',
    blue:'bg-blue-100 text-blue-800 border-blue-200',
    green:'bg-green-100 text-green-800 border-green-200',
    red:'bg-red-100 text-red-800 border-red-200',
    yellow:'bg-yellow-100 text-yellow-800 border-yellow-200',
    purple:'bg-purple-100 text-purple-800 border-purple-200',
    pink:'bg-pink-100 text-pink-800 border-pink-200',
    orange:'bg-orange-100 text-orange-800 border-orange-200',
    cyan:'bg-cyan-100 text-cyan-800 border-cyan-200'
  }
  return <span className={clsx('inline-flex items-center gap-1 px-2 h-6 text-xs rounded border', colors[color]||colors.gray, className)}>{children}</span>
}
