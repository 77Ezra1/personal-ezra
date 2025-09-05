import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { chatWithLLM } from '../lib/llm'
    } finally {
      setLoading(false)
    }
  }
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

        </button>
      </div>
    </div>
  )
}
