// Package wire decodes events from the order-events queue.
//
// Every event starts with a 16-byte header, in network byte order:
//
//	 0                   1                   2                   3
//	 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
//	+-------+-------+---------------+-------------------------------+
//	|Version| Type  |     Flags     |         Payload length        |
//	+-------+-------+---------------+-------------------------------+
//	|                     Order ID (first 64 bits)                  |
//	+                                                               +
//	|                                                               |
//	+---------------------------------------------------------------+
//	|                     Attempt (32 bits)                         |
//	+---------------------------------------------------------------+
//
// The payload follows the header: JSON, at most 64 KiB.
package wire

import (
	"encoding/binary"
	"errors"
)

const HeaderSize = 16

// Event types.
const (
	TypePayment  = 1
	TypeShipping = 2
	TypeDelivery = 3
)

// Flags.
const (
	FlagRetry      = 1 << 0 // the event was sent again after a failed attempt
	FlagCompressed = 1 << 1 // the payload is gzip-compressed
)

type Header struct {
	Version       uint8
	Type          uint8
	Flags         uint8
	PayloadLength uint16
	OrderID       uint64
	Attempt       uint32
}

var ErrShort = errors.New("event shorter than its header")

func Decode(b []byte) (Header, []byte, error) {
	if len(b) < HeaderSize {
		return Header{}, nil, ErrShort
	}
	h := Header{
		Version:       b[0] >> 4,
		Type:          b[0] & 0x0f,
		Flags:         b[1],
		PayloadLength: binary.BigEndian.Uint16(b[2:4]),
		OrderID:       binary.BigEndian.Uint64(b[4:12]),
		Attempt:       binary.BigEndian.Uint32(b[12:16]),
	}
	end := HeaderSize + int(h.PayloadLength)
	if len(b) < end {
		return Header{}, nil, ErrShort
	}
	return h, b[HeaderSize:end], nil
}
