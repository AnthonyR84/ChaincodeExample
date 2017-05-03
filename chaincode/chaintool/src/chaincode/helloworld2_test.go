package main

import (
	"fmt"
	"github.com/hyperledger/fabric/core/chaincode/shim"
	"testing"
)

func checkInit(t *testing.T, stub *shim.MockStub, args [][]byte) {
	res := stub.MockInit("1", args)
	if res.Status != shim.OK {
		fmt.Println("Init failed", string(res.Message))
		t.FailNow()
	}
}

func checkState(t *testing.T, stub *shim.MockStub, name string, value string) {
	bytes := stub.State[name]
	if bytes == nil {
	fmt.Println("State", name , value)
	fmt.Println("State", name, "failed to get value")
	t.FailNow()
	}
	if string(bytes) != value {
		fmt.Println("State", name , value)
		fmt.Println("State value", name, "was not", value, "as expected")
		t.FailNow()
	}
}

func checkInvoke(t *testing.T, stub *shim.MockStub, args [][]byte) {
	res := stub.MockInvoke("1", args)
	if res.Status != shim.OK {
		fmt.Println("Invoke", args, "failed", string(res.Message))
		t.FailNow()
	}
}

func TestHelloWorld02_Init(t *testing.T) {
	scc := new(SimpleChaincode)
	stub := shim.NewMockStub("helloworld02", scc)

	// Init
	checkInit(t, stub, [][]byte{})

	checkState(t, stub, "user1", "hello world !")

}

func TestHelloWorld02_Invoke(t *testing.T) {
	scc := new(SimpleChaincode)
	stub := shim.NewMockStub("helloworld02", scc)

	// Init
	checkInit(t, stub, [][]byte{[]byte("init")})
	checkState(t, stub, "user1", "hello world !")

	// Invoke user named Anthony
	checkInvoke(t, stub, [][]byte{[]byte("greetings"),[]byte("Anthony")})
	checkState(t, stub, "Anthony", "hello Anthony !")

	// Invoke user named Jean-Yves
	checkInvoke(t, stub, [][]byte{[]byte("greetings"),[]byte("Jean-Yves")})
	checkState(t, stub, "Jean-Yves", "hello Jean-Yves !")

}
